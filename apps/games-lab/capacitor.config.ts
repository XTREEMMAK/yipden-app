import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
	appId: 'com.yipden.gamelab',
	appName: 'YipDen Games Lab',
	webDir: 'build',
	backgroundColor: '#1c1510',
	loggingBehavior: 'none',
	android: { allowMixedContent: false },
	server: { androidScheme: 'https' }
};
export default config;
