import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "EcomPilot",
  slug: "ecompilot",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  scheme: "ecompilot",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0f0a1e",
  },
  ios: {
    bundleIdentifier: "com.ecompilot.app",
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        "EcomPilot uses the camera to scan product barcodes.",
      NSFaceIDUsageDescription:
        "EcomPilot uses Face ID to securely authenticate you.",
    },
  },
  android: {
    package: "com.ecompilot.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f0a1e",
    },
    permissions: [
      "CAMERA",
      "USE_BIOMETRIC",
      "USE_FINGERPRINT",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    [
      "expo-camera",
      {
        cameraPermission:
          "EcomPilot uses the camera to scan product barcodes.",
      },
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "EcomPilot uses Face ID to securely authenticate you.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#7c3aed",
        sounds: ["./assets/notification.wav"],
      },
    ],
    [
      "expo-secure-store",
      {
        configureAndroidBackup: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env["EAS_PROJECT_ID"] ?? "",
    },
  },
});
