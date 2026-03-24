// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot Mobile — Scanner Overlay with animated scan frame
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect } from "react";
import { View, Text, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const FRAME_SIZE = SCREEN_WIDTH * 0.7;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 3;

// Vertical offset so the scan frame sits slightly above center
const FRAME_TOP = (SCREEN_HEIGHT - FRAME_SIZE) / 2 - 40;

interface ScanOverlayProps {
  readonly instruction: string;
  readonly isScanning?: boolean;
  readonly scanned?: boolean;
}

function CornerMark({
  position,
}: {
  position: "tl" | "tr" | "bl" | "br";
}): React.JSX.Element {
  const isTop = position === "tl" || position === "tr";
  const isLeft = position === "tl" || position === "bl";

  return (
    <View
      style={{
        position: "absolute",
        top: isTop ? 0 : undefined,
        bottom: !isTop ? 0 : undefined,
        left: isLeft ? 0 : undefined,
        right: !isLeft ? 0 : undefined,
        width: CORNER_SIZE,
        height: CORNER_SIZE,
      }}
    >
      {/* Horizontal bar */}
      <View
        style={{
          position: "absolute",
          top: isTop ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          left: 0,
          right: 0,
          height: CORNER_THICKNESS,
          backgroundColor: "#8b5cf6",
          borderRadius: 2,
        }}
      />
      {/* Vertical bar */}
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: isLeft ? 0 : undefined,
          right: !isLeft ? 0 : undefined,
          width: CORNER_THICKNESS,
          backgroundColor: "#8b5cf6",
          borderRadius: 2,
        }}
      />
    </View>
  );
}

export function ScanOverlay({
  instruction,
  isScanning = true,
  scanned = false,
}: ScanOverlayProps): React.JSX.Element {
  const scanLineY = useSharedValue(0);

  useEffect(() => {
    if (isScanning && !scanned) {
      scanLineY.value = withRepeat(
        withTiming(FRAME_SIZE - 4, {
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true
      );
    } else {
      scanLineY.value = FRAME_SIZE / 2;
    }
  }, [isScanning, scanned, scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
    opacity: scanned ? 0 : 1,
  }));

  const frameLeft = (SCREEN_WIDTH - FRAME_SIZE) / 2;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Top dark overlay */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: FRAME_TOP,
          backgroundColor: "rgba(0,0,0,0.7)",
        }}
      />

      {/* Left dark overlay */}
      <View
        style={{
          position: "absolute",
          top: FRAME_TOP,
          left: 0,
          width: frameLeft,
          height: FRAME_SIZE,
          backgroundColor: "rgba(0,0,0,0.7)",
        }}
      />

      {/* Right dark overlay */}
      <View
        style={{
          position: "absolute",
          top: FRAME_TOP,
          right: 0,
          width: frameLeft,
          height: FRAME_SIZE,
          backgroundColor: "rgba(0,0,0,0.7)",
        }}
      />

      {/* Bottom dark overlay */}
      <View
        style={{
          position: "absolute",
          top: FRAME_TOP + FRAME_SIZE,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)",
        }}
      />

      {/* Scan frame */}
      <View
        style={{
          position: "absolute",
          top: FRAME_TOP,
          left: frameLeft,
          width: FRAME_SIZE,
          height: FRAME_SIZE,
        }}
      >
        <CornerMark position="tl" />
        <CornerMark position="tr" />
        <CornerMark position="bl" />
        <CornerMark position="br" />

        {/* Scan line */}
        <Animated.View
          style={[
            scanLineStyle,
            {
              position: "absolute",
              left: 4,
              right: 4,
              height: 2,
              borderRadius: 1,
              backgroundColor: scanned ? "#22c55e" : "#8b5cf6",
              shadowColor: scanned ? "#22c55e" : "#8b5cf6",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 6,
              elevation: 8,
            },
          ]}
        />

        {/* Success checkmark */}
        {scanned && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "rgba(34,197,94,0.2)",
                borderWidth: 2,
                borderColor: "#22c55e",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#4ade80", fontSize: 20 }}>✓</Text>
            </View>
          </View>
        )}
      </View>

      {/* Instruction text */}
      <View
        style={{
          position: "absolute",
          top: FRAME_TOP + FRAME_SIZE + 24,
          left: 0,
          right: 0,
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: "white", textAlign: "center", fontSize: 14, opacity: 0.8 }}>
          {instruction}
        </Text>
      </View>
    </View>
  );
}
