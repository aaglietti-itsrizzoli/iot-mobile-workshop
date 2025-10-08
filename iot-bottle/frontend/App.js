import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import axios from 'axios';
import Svg, { Defs, ClipPath, Path, Rect, Polygon, G, Circle } from 'react-native-svg';

const RETENTION = 1000;
const VERSION = '0.0.4';
const INTERVAL = 100;
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

const _ = new Date();
console.log('App loaded', _);

const GITHUB_CODESPACE_NAME = 'fluffy-xylophone-xg7jv9vx5vqcv666';
const API_BASE_URL = `https://${GITHUB_CODESPACE_NAME}-3000.app.github.dev`;
async function devices(team, fingerprint, setError) {
  console.log('POST /devices', { _: new Date(), team, fingerprint });

  try {
    await axios.post(
      `${API_BASE_URL}/devices`,
      {
        fingerprintData: FINGERPRINT_DATA,
        team,
        fingerprint,
      },
      {
        headers: {},
      }
    );
    console.log('POST /devices completed', {
      _: new Date(),
      team,
      fingerprint,
    });
  } catch (e) {
    console.log('POST /devices ERROR', { _: new Date(), team, fingerprint, e });
    setError("POST /devices ERROR: " + e.message);
  }
}

async function events(team, fingerprint, event) {
  const path = `/devices/${fingerprint}/events`;
  console.log(`POST ${path}`, { _: new Date(), team, fingerprint, event });

  await axios.post(
    `${API_BASE_URL}${path}`,
    {
      team,
      fingerprint,
      event,
    },
    {
      headers: {},
    }
  );

  console.log(`POST ${path} completed`, {
    _: new Date(),
    team,
    fingerprint,
    event,
  });
}

// --- Helpers per calcolo angoli/versamento ---
const rad2deg = (r) => (r * 180) / Math.PI;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function computeOrientation({ x, y, z }) {
  // modulo dell'accelerazione (in g)
  const g = Math.sqrt(x * x + y * y + z * z) || 1;
  // angolo rispetto alla verticale (0° verticale, 90° orizzontale)
  const angleFromVerticalDeg = rad2deg(Math.acos(clamp(-z / g, -1, 1)));
  // roll (inclinazione sx/dx) ~ rotazione visibile del pelo dell'acqua
  const rollDeg = rad2deg(Math.atan2(y, -z)); // 0° in verticale
  // pitch (inclinazione avanti/indietro)
  const pitchDeg = rad2deg(Math.atan2(x, -z));
  return { angleFromVerticalDeg, rollDeg, pitchDeg };
}

function computePourRate(angleFromVerticalDeg) {
  // versa solo tra 30° e 120°: sufficiente per far entrare aria, ma non "a testa in giù"
  const minA = 30;
  const maxA = 120;
  if (angleFromVerticalDeg < minA || angleFromVerticalDeg > maxA) return 0;
  // normalizza 0..1 tra minA e 90° (~versata massima), poi decresce fino a maxA
  let t;
  if (angleFromVerticalDeg <= 90) {
    t = (angleFromVerticalDeg - minA) / (90 - minA);
  } else {
    t = (maxA - angleFromVerticalDeg) / (maxA - 90);
  }
  t = clamp(t, 0, 1);
  const maxPerSec = 0.25; // percentuale di volume al secondo alla massima inclinazione
  return t * maxPerSec;
}

// Clipping half-plane (sotto la retta y = m x + c) di un rettangolo W x H
function clipRectBelowLine(W, H, m, c) {
  // Poligono rettangolo iniziale (clockwise)
  let poly = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const inside = (p) => p.y - (m * p.x + c) >= 0; // "sotto" la linea
  const intersect = (p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const denom = dy - m * dx;
    if (Math.abs(denom) < 1e-6) return p2; // quasi parallelo: ritorna il secondo punto
    const t = (c + m * p1.x - p1.y) / denom;
    const x = p1.x + t * dx;
    const y = p1.y + t * dy;
    return { x, y };
  };
  const output = [];
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

function Bottle({ width = 240, height = 420, rollDeg = 0, level = 0.7}) {
  const W = width;
  const H = height;
  const neckTopY = H * 0.08;
  const neckBottomY = H * 0.20;
  const neckLeftX = W * 0.40;
  const neckRightX = W * 0.60;
  const bodyLeftX = W * 0.18;
  const bodyRightX = W * 0.82;
  const bodyBottomY = H * 0.96;

  // Sagoma stilizzata della borraccia (interno)
  const bottlePath = `
    M ${neckLeftX} ${neckTopY}
    Q ${W * 0.50} ${H * 0.02} ${neckRightX} ${neckTopY}
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

  // beccuccio (posizione approssimata per il flusso)
  const spoutX = neckRightX;

  // Calcolo poligono "acqua" come metà piano sotto la retta di pendenza rollDeg
  const m = Math.tan((rollDeg * Math.PI) / 180);
  // livello: 0 = vuota, 1 = piena; y0 è la quota al centro della bottiglia
  const y0 = H * (1 - clamp(level, 0, 1));
  const c = y0 - m * (W / 2);
  const waterPoly = clipRectBelowLine(W, H, clamp(m, -50, 50), c);
  const waterPoints = waterPoly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <ClipPath id="bottle-clip">
          <Path d={bottlePath} />
        </ClipPath>
      </Defs>

      {/* Sagoma */}
      <Path d={bottlePath} fill="#eeeeee" stroke="#444" strokeWidth={2} />

      {/* Acqua dentro la borraccia, clip sulla sagoma */}
      <G clipPath="url(#bottle-clip)">
        <Rect x={0} y={0} width={W} height={H} fill="#cdeffd" />
        <Polygon points={waterPoints} fill="#2ca6dd" opacity={0.95} />
      </G>

      {/* Beccuccio (tratteggio per suggerire apertura) */}
      <Path
        d={`M ${spoutX - 6} ${neckTopY - 4} L ${spoutX + 10} ${neckTopY - 4} L ${spoutX + 10} ${neckBottomY + 4} L ${spoutX - 6} ${neckBottomY + 4} Z`}
        fill="#ddd"
        stroke="#444"
        strokeWidth={1}
        opacity={0.7}
      />
    </Svg>
  );
}

export default function App() {
  const now = new Date();
  const [{ x, y, z }, setData] = useState({
    x: 0,
    y: 0,
    z: 0,
  });
  const [subscription, setSubscription] = useState(null);

  const _subscribe = (_team, _fingerprint) => {
    setSubscription(
      Accelerometer.addListener((acceleremoterData) => {
        setData(acceleremoterData);
        const _ = new Date();
        setChartDataX((prevState) => {
          return [
            ...(prevState.length > RETENTION
              ? prevState.slice(prevState.length - RETENTION)
              : prevState),
            { x: _, y: acceleremoterData.x },
          ];
        });
        setChartDataY((prevState) => {
          return [
            ...(prevState.length > RETENTION
              ? prevState.slice(prevState.length - RETENTION)
              : prevState),
            { x: _, y: acceleremoterData.y },
          ];
        });
        setChartDataZ((prevState) => {
          return [
            ...(prevState.length > RETENTION
              ? prevState.slice(prevState.length - RETENTION)
              : prevState),
            { x: _, y: acceleremoterData.z },
          ];
        });
      })
    );
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  const [fingerprint, setFingerprint] = useState(null);
  const [team, setTeam] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const _ = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(FINGERPRINT_DATA)
      );
      setFingerprint(_);
      const first = _.slice(0, 2);
      const second = _.slice(2, 4);
      const third = _.slice(4, 6);
      const fourth = _.slice(6, 8);
      const teams = {
        [first]: 'red',
        [second]: 'yellow',
        [third]: 'blue',
        [fourth]: 'green',
      };
      const higher = [first, second, third, fourth].sort().pop();
      const team = teams[higher];
      setTeam(team);
      await devices(team, _, setError);
      _subscribe(team, _);
      Accelerometer.setUpdateInterval(INTERVAL);
      return () => _unsubscribe();
    })();
  }, []);

  const [chartDataX, setChartDataX] = useState([{ x: _, y: 0 }]);
  const [chartDataY, setChartDataY] = useState([{ x: _, y: 0 }]);
  const [chartDataZ, setChartDataZ] = useState([{ x: _, y: 0 }]);

  // Stato del livello dell'acqua
  const [waterLevel, setWaterLevel] = useState(0.7);

  // Aggiorna livello acqua in base all'inclinazione (versamento)
  useEffect(() => {
    const { angleFromVerticalDeg } = computeOrientation({ x, y, z });
    const ratePerSec = computePourRate(angleFromVerticalDeg);
    if (ratePerSec <= 0) return; // niente versamento
    const dt = INTERVAL / 1000;
    setWaterLevel((prev) => clamp(prev - ratePerSec * dt, 0, 1));
  }, [x, y, z]);

  const { rollDeg } = computeOrientation({ x, y, z });

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image style={styles.tinyLogo} source={require('./logo.png')} />
      </View>
      <Text style={styles.text}>v {VERSION}</Text>
      <Text style={{ ...styles.text, fontSize: 18, color: team }}>
        {fingerprint}
      </Text>
      <Text style={styles.text}>loaded on {_.toISOString()}</Text>
      <Text style={styles.text}>now is {now.toISOString()}</Text>
      <Text style={styles.text}>waterLevel is {waterLevel}</Text>
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

      {/* Borraccia con acqua animata */}
      <View style={styles.bottleWrapper}>
        <Bottle rollDeg={clamp(rollDeg, -70, 70)} level={waterLevel} />
      </View>
    </View>
  );
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
    width: 250,
    height: 250,
  },
  bottleWrapper: {
    marginTop: 10,
    alignItems: 'center',
  },
});
