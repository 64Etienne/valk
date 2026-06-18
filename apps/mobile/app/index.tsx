import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Valk</Text>
      <Text style={styles.subtitle}>Beta mobile — fondations</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b12' },
  title: { color: '#c4b5fd', fontSize: 40, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: '#9ca3af', fontSize: 16, marginTop: 8 },
});
