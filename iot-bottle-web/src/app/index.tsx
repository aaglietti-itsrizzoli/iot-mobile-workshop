// src/app/index.tsx
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  Vibration,
  Button,
  Platform,
} from 'react-native';
import { Accelerometer, AccelerometerMeasurement } from 'expo-sensors';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import axios from 'axios';
import Svg, {
  Defs,
  ClipPath,
  Path,
  Rect,
  Polygon,
  G,
} from 'react-native-svg';

const RETENTION = 1000;
const VERSION = '0.1.4';
const INTERVAL = 500;

// Accelerazione di gravità: serve per normalizzare i dati del web
// (DeviceMotion restituisce m/s^2) alla convenzione "in g" usata da expo-sensors.
const G_FORCE = 9.81;

const FINGERPRINT_DATA = {
  brand: Device.brand,
  designName: Device.designName,
  deviceName: Device.deviceName,
  deviceType: Device.deviceType,
  deviceYearClass: Device.deviceYearClass,
  isDevice: Device.isDevice,
  manufacturer: Device.manufacturer,
  modelId: Device.modelId,
  modelName: Device.modelName,
  osBuildFingerprint: Device.osBuildFingerprint,
  osBuildId: Device.osBuildId,
  osInternalBuildId: Device.osInternalBuildId,
  osName: Device.osName,
  osVersion: Device.osVersion,
  platformApiLevel: Device.platformApiLevel,
  productName: Device.productName,
  supportedCpuArchitectures: Device.supportedCpuArchitectures,
  totalMemory: Device.totalMemory,
};

type Accel = { x: number; y: number; z: number };

// ---------------------------------------------------------------------------
// Backup web: DeviceMotion API del browser
// expo-sensors 58 ha l'implementazione web rotta (addListener non è una funzione),
// quindi sul web usiamo direttamente window.addEventListener('devicemotion', ...).
// ---------------------------------------------------------------------------
function subscribeWeb(
  onData: (d: Accel) => void,
  intervalMs: number
): { remove: () => void } {
  // console.log("subscribeWeb", {_: new Date()});
  let last = 0;
  const handler = (event: Event) => {
    // console.log("subscribeWeb / handler", event);
    const e = event as DeviceMotionEvent;
    const acc = e.accelerationIncludingGravity;
    if (!acc) return; // senza gravità non possiamo calcolare l'orientamento
    const t = Date.now();
    if (t - last < intervalMs) return; // throttle ~ come setUpdateInterval su native
    last = t;
    // NB: la DeviceMotion API restituisce m/s^2; dividiamo per G per avere valori "in g".
    // NB2: la convenzione dei segni degli assi sul web può differire da quella nativa
    //      di expo-sensors; se la borraccia si versa al contrario, invertire qui il
    //      segno (es. z: -(acc.z ?? 0) / G) finché il comportamento combacia.
    onData({
      x: (acc.x ?? 0) / G_FORCE,
      y: (acc.y ?? 0) / G_FORCE,
      z: (acc.z ?? 0) / G_FORCE,
    });
  };
  window.addEventListener('devicemotion', handler, true);
  return {
    remove: () => window.removeEventListener('devicemotion', handler, true),
  };
}

// Funzione per verificare la disponibilità dell'accelerometro
const checkAccelerometerAvailability = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    // Sul web verifichiamo la presenza della DeviceMotion API invece di
    // interrogare expo-sensors (che qui è bugato).
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).DeviceMotionEvent !== 'undefined'
    );
  }
  try {
    const isAvailable = await Accelerometer.isAvailableAsync();
    return !!isAvailable;
  } catch {
    return false;
  }
};

// Funzione per richiedere i permessi per l'accelerometro (necessario per web mobile)
const requestAccelerometerPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    const DME: any =
      typeof window !== 'undefined' ? (window as any).DeviceMotionEvent : undefined;
    // iOS 13+ Safari: il permesso ai sensori di movimento va richiesto esplicitamente,
    // e SOLO in risposta a un gesto utente (per questo lo lanciamo dal bottone).
    if (DME && typeof DME.requestPermission === 'function') {
      try {
        const res = await DME.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    // Altri browser (Android/Chrome, desktop): nessun permesso esplicito necessario.
    return true;
  }
  try {
    const { granted } = await Accelerometer.requestPermissionsAsync();
    return !!granted;
  } catch {
    return false;
  }
};

// Funzione che avvia il turno del giocatore
const startMyTurn = async (
  turnId: string,
  deviceHash: string,
  setWaterLevel: (level: number) => void,
  setError: (msg: string) => void
): Promise<boolean> => {
  const url = `${API_BASE_URL}/turns/${turnId}/devices/${deviceHash}/waterLevel`;

  try {
    setWaterLevel(1);
    await axios.patch(url, { waterLevel: 1 });
  } catch (error: any) {
    setError('PATCH /waterLEvel ERROR: ' + error.message);
  }

  Vibration.vibrate(1000);

  return true;
};

const _ = new Date();

const GITHUB_CODESPACE_NAME = 'accursed-apparition-r5qjprp6jp9cx5vp';
const API_BASE_URL = `https://${GITHUB_CODESPACE_NAME}-3000.app.github.dev`;

async function devices(
  team: string,
  fingerprint: string,
  setError: (msg: string) => void
): Promise<void> {
  try {
    await axios.post(
      `${API_BASE_URL}/devices`,
      { fingerprintData: FINGERPRINT_DATA, team, fingerprint },
      { headers: {} }
    );
  } catch (e: any) {
    setError('POST /devices ERROR: ' + e.message);
  }
}

// Funzione per il polling dell'API /polling
async function polling(setError: (msg: string) => void): Promise<any> {
  try {
    const response = await axios.get(`${API_BASE_URL}/polling`);
    if (response.data.turn) {
      return { success: true, ...response.data };
    }
  } catch (e: any) {
    setError('GET /polling ERROR: ' + e.message);
  }
  return { success: false };
}

async function events(team: string, fingerprint: string, event: unknown): Promise<void> {
  const path = `/devices/${fingerprint}/events`;
  await axios.post(
    `${API_BASE_URL}${path}`,
    { team, fingerprint, event },
    { headers: {} }
  );
}

// --- Helpers per calcolo angoli/versamento ---
const rad2deg = (r: number): number => (r * 180) / Math.PI;
const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

function computeOrientation({ x, y, z }: { x: number; y: number; z: number }) {
  const g = Math.sqrt(x * x + y * y + z * z) || 1;
  const angleFromVerticalDeg = rad2deg(Math.acos(clamp(-z / g, -1, 1)));
  const rollDeg = rad2deg(Math.atan2(y, -z));
  const pitchDeg = rad2deg(Math.atan2(x, -z));
  return { angleFromVerticalDeg, rollDeg, pitchDeg };
}

function computePourRate(angleFromVerticalDeg: number, optimalAngle: number): number {
  const minA = 0;
  const maxA = 180;
  if (angleFromVerticalDeg < minA || angleFromVerticalDeg > maxA) return 0;

  const tolerance = 3;
  if (
    optimalAngle - tolerance < angleFromVerticalDeg &&
    angleFromVerticalDeg < optimalAngle + tolerance
  ) {
    let t: number;
    if (angleFromVerticalDeg <= 90) {
      t = (angleFromVerticalDeg - minA) / (90 - minA);
    } else {
      t = (maxA - angleFromVerticalDeg) / (maxA - 90);
    }
    t = clamp(t, 0, 1);
    const maxPerSec = 0.25;
    return t * maxPerSec;
  }

  return 0;
}

// Clipping half-plane (sotto la retta y = m x + c) di un rettangolo W x H
type Point = { x: number; y: number };

function clipRectBelowLine(W: number, H: number, m: number, c: number): Point[] {
  let poly: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const inside = (p: Point) => p.y - (m * p.x + c) >= 0;
  const intersect = (p1: Point, p2: Point): Point => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const denom = dy - m * dx;
    if (Math.abs(denom) < 1e-6) return p2;
    const t = (c + m * p1.x - p1.y) / denom;
    const x = p1.x + t * dx;
    const y = p1.y + t * dy;
    return { x, y };
  };
  const output: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const s = poly[i];
    const e = poly[(i + 1) % poly.length];
    const sIn = inside(s);
    const eIn = inside(e);
    if (eIn) {
      if (!sIn) output.push(intersect(s, e));
      output.push(e);
    } else if (sIn) {
      output.push(intersect(s, e));
    }
  }
  return output;
}

type BottleProps = {
  width?: number;
  height?: number;
  rollDeg?: number;
  level?: number;
};

function Bottle({ width = 240, height = 420, rollDeg = 0, level = 0.7 }: BottleProps) {
  const W = width;
  const H = height;
  const neckTopY = H * 0.08;
  const neckBottomY = H * 0.2;
  const neckLeftX = W * 0.4;
  const neckRightX = W * 0.6;
  const bodyLeftX = W * 0.18;
  const bodyRightX = W * 0.82;
  const bodyBottomY = H * 0.96;

  const bottlePath = `
    M ${neckLeftX} ${neckTopY}
    Q ${W * 0.5} ${H * 0.02} ${neckRightX} ${neckTopY}
    L ${neckRightX} ${neckBottomY}
    Q ${bodyRightX} ${H * 0.24} ${bodyRightX} ${H * 0.36}
    L ${bodyRightX} ${H * 0.86}
    Q ${bodyRightX} ${bodyBottomY} ${W * 0.55} ${bodyBottomY}
    L ${W * 0.45} ${bodyBottomY}
    Q ${bodyLeftX} ${bodyBottomY} ${bodyLeftX} ${H * 0.86}
    L ${bodyLeftX} ${H * 0.36}
    Q ${bodyLeftX} ${H * 0.24} ${neckLeftX} ${neckBottomY}
    Z
  `;

  const spoutX = neckRightX;

  const m = Math.tan((rollDeg * Math.PI) / 180);
  const y0 = H * (1 - clamp(level, 0, 1));
  const c = y0 - m * (W / 2);
  const waterPoly = clipRectBelowLine(W, H, clamp(m, -50, 50), c);
  const waterPoints = waterPoly
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <ClipPath id="bottle-clip">
          <Path d={bottlePath} />
        </ClipPath>
      </Defs>

      <Path d={bottlePath} fill="#eeeeee" stroke="#444" strokeWidth={2} />

      <G clipPath="url(#bottle-clip)">
        <Rect x={0} y={0} width={W} height={H} fill="#cdeffd" />
        <Polygon points={waterPoints} fill="#2ca6dd" opacity={0.95} />
      </G>

      <Path
        d={`M ${spoutX - 6} ${neckTopY - 4} L ${spoutX + 10} ${neckTopY - 4
          } L ${spoutX + 10} ${neckBottomY + 4} L ${spoutX - 6} ${neckBottomY + 4
          } Z`}
        fill="#ddd"
        stroke="#444"
        strokeWidth={1}
        opacity={0.7}
      />
    </Svg>
  );
}

export default function Index() {
  const [sensorsReady, setSensorsReady] = useState<boolean>(false);
  const now = new Date();
  const [{ x, y, z }, setData] = useState<Accel>({
    x: 0,
    y: 0,
    z: 0,
  });
  const [subscription, setSubscription] = useState<{ remove: () => void } | null>(null);

  const [chartDataX, setChartDataX] = useState<{ x: Date; y: number }[]>([{ x: _, y: 0 }]);
  const [chartDataY, setChartDataY] = useState<{ x: Date; y: number }[]>([{ x: _, y: 0 }]);
  const [chartDataZ, setChartDataZ] = useState<{ x: Date; y: number }[]>([{ x: _, y: 0 }]);

  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [waterLevel, setWaterLevel] = useState<number>(0);
  const [lastReportedLevel, setLastReportedLevel] = useState<number>(1.0);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [optimalAngle, setOptimalAngle] = useState<number>(60);

  const handleEnableSensors = async () => {
    if (team && fingerprint) {
      await _subscribe(team, fingerprint);
      setSensorsReady(true);
    }
  };

  // Callback condivisa: aggiorna stato e serie storiche, indipendentemente
  // dalla sorgente dei dati (native expo-sensors vs web DeviceMotion).
  const handleAccel = (d: Accel) => {
    // console.log("handleAccel", d);
    setData(d);
    const now2 = new Date();
    setChartDataX((prevState) => [
      ...(prevState.length > RETENTION
        ? prevState.slice(prevState.length - RETENTION)
        : prevState),
      { x: now2, y: d.x },
    ]);
    setChartDataY((prevState) => [
      ...(prevState.length > RETENTION
        ? prevState.slice(prevState.length - RETENTION)
        : prevState),
      { x: now2, y: d.y },
    ]);
    setChartDataZ((prevState) => [
      ...(prevState.length > RETENTION
        ? prevState.slice(prevState.length - RETENTION)
        : prevState),
      { x: now2, y: d.z },
    ]);
  };

  const _subscribe = async (_team: string | null, _fingerprint: string) => {
    const isAvailable = await checkAccelerometerAvailability();
    if (!isAvailable) {
      setError("L'accelerometro non è disponibile su questo dispositivo");
      return;
    }

    const hasPermissions = await requestAccelerometerPermissions();
    if (!hasPermissions) {
      setError(
        "I permessi per l'accelerometro sono stati negati. Abilitali nelle impostazioni."
      );
      return;
    }

    if (Platform.OS === 'web') {
      // Backup web: DeviceMotion API del browser (expo-sensors 58 è rotto sul web)
      setSubscription(subscribeWeb(handleAccel, INTERVAL));
    } else {
      // Native: usa expo-sensors come previsto
      Accelerometer.setUpdateInterval(INTERVAL);
      setSubscription(
        Accelerometer.addListener((acceleremoterData: AccelerometerMeasurement) =>
          handleAccel(acceleremoterData)
        )
      );
    }
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  useEffect(() => {
    (async () => {
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(FINGERPRINT_DATA)
      );
      setFingerprint(digest);
      const first = digest.slice(0, 2);
      const second = digest.slice(2, 4);
      const third = digest.slice(4, 6);
      const fourth = digest.slice(6, 8);
      const teams: Record<string, string> = {
        [first]: 'red',
        [second]: 'yellow',
        [third]: 'blue',
        [fourth]: 'green',
      };
      const higher = [first, second, third, fourth].sort().pop() as string;
      const teamResolved = teams[higher];
      setTeam(teamResolved);
      await devices(teamResolved, digest, setError);
      // La subscription viene avviata dal bottone (handleEnableSensors):
      // su iOS web il permesso DeviceMotion richiede un gesto utente.
    })();

    return () => _unsubscribe();
  }, []);

  // Funzione per generare un nuovo angolo ottimale casuale
  const generateNewOptimalAngle = (): number =>
    Math.floor(Math.random() * (170 - 20 + 1)) + 20;

  // Invia l'aggiornamento del waterLevel al server
  const reportWaterLevel = async (newLevel: number) => {
    if (!activeTurnId || !fingerprint) return;

    try {
      await axios.patch(
        `${API_BASE_URL}/turns/${activeTurnId}/devices/${fingerprint}/waterLevel`,
        { waterLevel: newLevel }
      );
      setLastReportedLevel(newLevel);
    } catch {
      // ignorato, come nell'originale
    }
  };

  // Polling per controllare se è il turno del dispositivo corrente
  useEffect(() => {
    if (!team || !fingerprint) return;

    const POLLING_INTERVAL = 2000;
    let isCurrentlyMyTurn = false;

    const checkTurn = async () => {
      try {
        const pollingData = await polling(setError);

        if (pollingData.success) {
          const activeFingerprints = pollingData.fingerprints;
          const turnId = pollingData.turn.id;

          if (activeFingerprints && Array.isArray(activeFingerprints)) {
            const isTurnActive = activeFingerprints.includes(fingerprint);

            if (isTurnActive && !isCurrentlyMyTurn) {
              isCurrentlyMyTurn = true;
              setActiveTurnId(turnId);
              const newAngle = generateNewOptimalAngle();
              setOptimalAngle(newAngle);
              startMyTurn(turnId, fingerprint, setWaterLevel, setError);
            } else if (!isTurnActive && isCurrentlyMyTurn) {
              isCurrentlyMyTurn = false;
              Vibration.cancel();
              setActiveTurnId(null);
            } else if (isTurnActive && isCurrentlyMyTurn) {
              Vibration.vibrate(1000);
            }
          } else if (isCurrentlyMyTurn) {
            isCurrentlyMyTurn = false;
            Vibration.cancel();
            setActiveTurnId(null);
          }
        }
      } catch (err: any) {
        setError('Error checking turn: ' + err.message);
      }
    };

    const pollingInterval = setInterval(checkTurn, POLLING_INTERVAL);

    return () => {
      clearInterval(pollingInterval);
      Vibration.cancel();
    };
  }, [team, fingerprint]);

  // Aggiorna livello acqua in base all'inclinazione (versamento)
  useEffect(() => {
    const { angleFromVerticalDeg } = computeOrientation({ x, y, z });
    const ratePerSec = computePourRate(angleFromVerticalDeg, optimalAngle);
    if (ratePerSec <= 0) return;
    const dt = INTERVAL / 1000;

    setWaterLevel((prev) => {
      const newLevel = clamp(prev - ratePerSec * dt, 0, 1);
      if (Math.abs(newLevel - lastReportedLevel) >= 0.1) {
        reportWaterLevel(newLevel);
      }
      return newLevel;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, z]);

  const { rollDeg, angleFromVerticalDeg } = computeOrientation({ x, y, z });

  if (!sensorsReady) {
    return (
      <View style={styles.container}>
        <Button title="Attiva Accelerometro" onPress={handleEnableSensors} />
        {error ? <Text>Error is {error}</Text> : null}
      </View>
    );
  } else {
    return (
      <View style={styles.container}>
        <View style={styles.logoContainer}>
          <Image style={styles.tinyLogo} source={require('../../assets/itsar/logo.png')} />
        </View>
        <Text style={styles.text}>v {VERSION}</Text>
        <Text style={{ ...styles.text, fontSize: 18, color: team ?? undefined }}>
          {fingerprint}
        </Text>
        <Text style={styles.text}>loaded on {_.toISOString()}</Text>
        <Text style={styles.text}>now is {now.toISOString()}</Text>
        {error ? <Text style={styles.text}>Error is {error}</Text> : null}
        <Text style={styles.text}>
          accelerometer data is in gs where 1g = 9.81 m/s^2
        </Text>
        <Text style={{ ...styles.text, color: 'red' }}>
          x({chartDataX.length}): {x}
        </Text>
        <Text style={{ ...styles.text, color: 'green' }}>
          y({chartDataY.length}): {y}
        </Text>
        <Text style={{ ...styles.text, color: 'blue' }}>
          z({chartDataZ.length}): {z}
        </Text>

        {waterLevel > 0 ? (
          <View style={styles.bottleWrapper}>
            <Bottle rollDeg={clamp(rollDeg, -70, 70)} level={waterLevel} />
          </View>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingLeft: 10,
  },
  logoContainer: {
    paddingTop: 30,
    alignItems: 'center',
  },
  text: {
    textAlign: 'left',
  },
  tinyLogo: {
    width: 25,
    height: 25,
  },
  bottleWrapper: {
    marginTop: 10,
    alignItems: 'center',
  },
});
