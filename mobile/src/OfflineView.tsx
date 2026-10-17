// 연결이 끊겼을 때 — 웹뷰 위에 덮는다(스펙 2026-10-12-앱-1 §4). 색은 웹 디자인 토큰(cream·eye-purple·text-light·lilac-deep)
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function OfflineView({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>연결이 끊겼어</Text>
      <Text style={styles.body}>인터넷 연결을 확인하고 다시 시도해줘</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#FAF6F0", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", color: "#5A3E8C" },
  body: { marginTop: 8, fontSize: 14, color: "#7A6BA0", textAlign: "center" },
  button: { marginTop: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999, backgroundColor: "#9F8AD0" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
