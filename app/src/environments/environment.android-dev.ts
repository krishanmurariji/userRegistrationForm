// Used by `npm run mobile:android:dev`: the app on an Android emulator talking to the API running on your own computer.
// The emulator reaches your computer as 10.0.2.2. For a real phone on the same Wi-Fi, replace it with your computer's
// address (for example http://192.168.1.20:5028) and start the API with --urls http://0.0.0.0:5028.
export const environment = {
  production: false,
  apiUrl: 'http://10.0.2.2:5028',
  /** Where the website's download buttons point: the newest published GitHub release. */
  downloadsUrl: 'https://github.com/krishanmurariji/SmallMart/releases/latest/download',
  googleClientId: '478008530175-79l8gdo3s7m6sohs9bge1p2o8nlee5br.apps.googleusercontent.com',
  microsoftClientId: '61bba06e-ef7f-4c33-8033-03b135a35fd3',
  microsoftTenant: 'common',
};
