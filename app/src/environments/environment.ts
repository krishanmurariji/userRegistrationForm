// Production settings. `ng serve` and development builds use environment.development.ts instead.
export const environment = {
  production: true,
  /**
   * Base URL of the hosted Small Mart API, without a trailing slash. The website and the Android, iOS and Windows apps
   * use it. The Release workflow can build against another address (its api_url box or the API_URL variable).
   */
  apiUrl: 'https://smallmart-api.runasp.net',
  /** Where the website's download buttons point: the newest published GitHub release. */
  downloadsUrl: 'https://github.com/krishanmurariji/userRegistrationForm/releases/latest/download',
  /**
   * Email address people can write to about their account and data. Shown on the privacy policy and delete-account
   * pages, which app stores require. Leave empty to hide it.
   */
  supportEmail: '',
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
