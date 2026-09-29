using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Runtime.InteropServices.JavaScript;
using ACadSharp.IO;

public partial class DwgBridge
{
    public static void Main() { }
    [JSExport]
    public static string ConvertDrawing(string base64)
    {
        var messages = new HashSet<string>();
        try {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            using var input = new MemoryStream(Convert.FromBase64String(base64));
            var document = DwgReader.Read(input, (_, e) => { if(messages.Count < 200) messages.Add(e.Message); });
            using var output = new MemoryStream();
            DxfWriter.Write(output, document, false, notification: (_, e) => { if(messages.Count < 200) messages.Add(e.Message); });
            return JsonSerializer.Serialize(new { dxfBase64 = Convert.ToBase64String(output.ToArray()), messages });
        } catch(Exception error) {
            return JsonSerializer.Serialize(new { error = error.Message, messages });
        }
    }
}
