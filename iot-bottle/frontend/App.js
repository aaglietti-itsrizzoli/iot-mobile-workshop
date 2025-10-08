import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import axios from 'axios';

const RETENTION = 1000;
const VERSION = '0.0.1';
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
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
});
