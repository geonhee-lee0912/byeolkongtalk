// 연결이 끊겼을 때 — 웹뷰 위에 덮는다(스펙 2026-10-12-앱-1 §4).
// 모양은 웹 공통 규칙(디자인 다듬기 ①)과 같게: 주 버튼 = 강조 보라 accent·모서리 12·높이 52, 보조 글자 = text-light(운영자 11-09)
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

export default function OfflineView({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.wrap}>
      <Image source={require("../assets/byeolkong.png")} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Text style={styles.title}>연결이 끊겼어</Text>
      <Text style={styles.body}>인터넷 연결을 확인하고 다시 시도해줘</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F5F2", padding: 24 },
  art: { width: 96, height: 123, marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", color: "#5A3E8C" },
  body: { marginTop: 8, fontSize: 14, lineHeight: 21, color: "#726398", textAlign: "center" },
  button: { marginTop: 28, width: "100%", maxWidth: 320, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#775CB0" },
  pressed: { opacity: 0.85 },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
});
