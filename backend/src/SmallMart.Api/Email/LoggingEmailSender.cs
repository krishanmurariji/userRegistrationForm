namespace SmallMart.Api.Email;

/// <summary>Development fallback used when no SMTP server is configured: writes the email to the log.</summary>
public class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        logger.LogInformation("EMAIL (not sent, no SMTP configured) To: {To} | Subject: {Subject}\n{Body}",
            toEmail, subject, htmlBody);
        return Task.CompletedTask;
    }
}
