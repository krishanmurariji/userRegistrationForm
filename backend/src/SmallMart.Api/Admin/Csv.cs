using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace SmallMart.Api.Admin;

/// <summary>Builds CSV files that open correctly in Excel.</summary>
public static class Csv
{
    public static FileContentResult File(string fileName, IEnumerable<string> header, IEnumerable<IEnumerable<object?>> rows)
    {
        var text = new StringBuilder();
        text.AppendLine(string.Join(",", header.Select(Cell)));
        foreach (var row in rows)
            text.AppendLine(string.Join(",", row.Select(Cell)));

        // The byte-order mark makes Excel read the file as UTF-8, so names and the rupee sign survive.
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(text.ToString())).ToArray();
        return new FileContentResult(bytes, "text/csv") { FileDownloadName = fileName };
    }

    private static string Cell(object? value)
    {
        var text = value switch
        {
            null => string.Empty,
            DateTimeOffset d => d.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss"),
            bool b => b ? "Yes" : "No",
            IFormattable f => f.ToString(null, System.Globalization.CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty,
        };

        // A cell that starts like a formula would be run by Excel. A leading apostrophe makes it plain text.
        if (value is string && text.Length > 0 && "=+-@\t\r".Contains(text[0]))
            text = "'" + text;
        return text.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{text.Replace("\"", "\"\"")}\"" : text;
    }
}
