using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace SmallMart.Api.Email;

public class SmtpOptions
{
    public const string Section = "Smtp";

    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = "Small Mart";
}

public class SmtpEmailSender(IOptions<SmtpOptions> options) : IEmailSender
{
    private readonly SmtpOptions _smtp = options.Value;

    public async Task SendAsync(string toEmail, string subject, string htmlBody, CancellationToken ct = default)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.FromName, _smtp.FromEmail));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;
        message.Body = new TextPart("html") { Text = htmlBody };

        using var client = new SmtpClient();
        await client.ConnectAsync(_smtp.Host, _smtp.Port, SecureSocketOptions.StartTlsWhenAvailable, ct);
        if (!string.IsNullOrEmpty(_smtp.Username))
            await client.AuthenticateAsync(_smtp.Username, _smtp.Password ?? string.Empty, ct);
        await client.SendAsync(FormatOptions.Default, new MailKit.SendRequest(message), ct);
        await client.DisconnectAsync(true, ct);
    }
}
