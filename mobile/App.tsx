// 별콩톡 앱 — 웹뷰 한 장(src/WebScreen.tsx). 노치·홈 바 영역은 앱이 비워 두고 웹은 그 안에 그린다.
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebScreen from "./src/WebScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FAF6F0" }} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <WebScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
