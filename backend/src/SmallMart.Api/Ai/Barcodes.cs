namespace SmallMart.Api.Ai;

public static class Barcodes
{
    /// <summary>
    /// Returns the digits when the text is a valid retail barcode (EAN-8, UPC-A, EAN-13 or GTIN-14), otherwise null.
    /// The last digit is a checksum, so one misread digit is caught instead of matching the wrong product.
    /// </summary>
    public static string? Normalize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;
        var digits = new string(text.Where(char.IsDigit).ToArray());
        if (digits.Length is not (8 or 12 or 13 or 14) || digits.Length != text.Count(c => !char.IsWhiteSpace(c) && c != '-'))
            return null;

        var sum = 0;
        for (var i = 0; i < digits.Length - 1; i++)
        {
            var digit = digits[digits.Length - 2 - i] - '0';
            sum += i % 2 == 0 ? digit * 3 : digit;
        }
        return (10 - sum % 10) % 10 == digits[^1] - '0' ? digits : null;
    }
}
