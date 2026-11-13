export const environment = {
  production: false,
  /** Base URL of the Small Mart API, without a trailing slash. */
  apiUrl: 'http://localhost:5028',
  /** Google OAuth client id (public). Leave empty to hide the Google button. */
  googleClientId: '478008530175-79l8gdo3s7m6sohs9bge1p2o8nlee5br.apps.googleusercontent.com',
  /** Microsoft Entra application (client) id (public). Leave empty to hide the Microsoft button. */
  microsoftClientId: '61bba06e-ef7f-4c33-8033-03b135a35fd3',
  /**
   * Who may sign in with Microsoft: 'common' (work, school and personal accounts), 'organizations',
   * 'consumers', or a tenant id when the app registration is limited to one organisation.
   */
  microsoftTenant: 'common',
};
