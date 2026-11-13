export const environment = {
  production: false,
  /** Base URL of the Small Mart API, without a trailing slash. */
  apiUrl: 'http://localhost:5028',
  /** Google OAuth client id (public). Leave empty to hide the Google button. */
  googleClientId: '110464729943-tj3o8brinm2p366s9ld4qajrd3drbosa.apps.googleusercontent.com',
  /** Microsoft Entra application (client) id (public). Leave empty to hide the Microsoft button. */
  microsoftClientId: '46ce7ac9-a645-48e4-a5f9-756c0266039b',
  /**
   * Who may sign in with Microsoft: 'common' (work, school and personal accounts), 'organizations',
   * 'consumers', or a tenant id when the app registration is limited to one organisation.
   */
  microsoftTenant: 'common',
};
