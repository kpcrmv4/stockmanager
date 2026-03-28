# RawPrint.ps1 - Send raw data to printer
param(
    [string]$PrinterName,
    [string]$FilePath
)

$signature = @'
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW
    {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter = IntPtr.Zero;
        int dwWritten = 0;
        bool success = false;

        if (OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            DOCINFOW di = new DOCINFOW();
            di.pDocName = "Receipt";
            di.pDatatype = "RAW";

            if (StartDocPrinter(hPrinter, 1, ref di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    IntPtr pBytes = Marshal.AllocHGlobal(bytes.Length);
                    Marshal.Copy(bytes, 0, pBytes, bytes.Length);

                    success = WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten);

                    Marshal.FreeHGlobal(pBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }

        return success && (dwWritten == bytes.Length);
    }
}
'@

try {
    Add-Type -TypeDefinition $signature -Language CSharp -ErrorAction Stop
} catch {
    # Type already added, ignore
}

# Read file and send to printer
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$result = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)

if ($result) {
    Write-Host "SUCCESS"
    exit 0
} else {
    Write-Host "FAILED"
    exit 1
}
