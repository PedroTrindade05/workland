# Extrai ícones "jumbo" (até 256px) do shell do Windows.
# Entrada: arquivo com um caminho por linha. Saída: "caminho<TAB>base64png" por linha.
param([string]$List)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class Jumbo {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct SHFILEINFO { public IntPtr hIcon; public int iIcon; public uint attr;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string name;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string type; }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr SHGetFileInfo(string p, uint a, ref SHFILEINFO i, uint s, uint f);
  [DllImport("shell32.dll")]
  static extern int SHGetImageList(int list, ref Guid riid, out IntPtr ppv);
  [DllImport("comctl32.dll")]
  static extern IntPtr ImageList_GetIcon(IntPtr himl, int i, int flags);
  [DllImport("user32.dll")]
  static extern bool DestroyIcon(IntPtr h);

  static Bitmap Get(string path, int list) {
    var info = new SHFILEINFO();
    SHGetFileInfo(path, 0, ref info, (uint)Marshal.SizeOf(info), 0x4000);
    Guid iid = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
    IntPtr himl;
    if (SHGetImageList(list, ref iid, out himl) != 0) return null;
    IntPtr h = ImageList_GetIcon(himl, info.iIcon, 1);
    if (h == IntPtr.Zero) return null;
    var bmp = Icon.FromHandle(h).ToBitmap();
    DestroyIcon(h);
    return bmp;
  }

  static Rectangle Bounds(Bitmap b) {
    int x0 = b.Width, y0 = b.Height, x1 = -1, y1 = -1;
    for (int y = 0; y < b.Height; y += 8)
      for (int x = 0; x < b.Width; x += 8)
        if (b.GetPixel(x, y).A > 10) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 < 0) return Rectangle.Empty;
    return Rectangle.FromLTRB(x0, y0, Math.Min(b.Width, x1 + 8), Math.Min(b.Height, y1 + 8));
  }

  public static string Png(string path) {
    Bitmap b = Get(path, 4);
    if (b != null) {
      var r = Bounds(b);
      // ícone sem versão grande vem minúsculo no canto: usa a lista de 48px
      if (r.Width < 100) { b.Dispose(); b = Get(path, 2); }
    } else b = Get(path, 2);
    if (b == null) return null;
    using (var ms = new MemoryStream()) { b.Save(ms, ImageFormat.Png); b.Dispose(); return Convert.ToBase64String(ms.ToArray()); }
  }
}
"@
$wsh = New-Object -ComObject WScript.Shell
# atalho: usa o ícone declarado ou o executável de destino (o ícone do .lnk em si costuma vir genérico)
function Resolve-IconSource([string]$p) {
  if ($p -notmatch '\.lnk$') { return $p }
  try {
    $sc = $wsh.CreateShortcut($p)
    $loc = ($sc.IconLocation -split ',')[0]
    if ($loc) { $loc = [Environment]::ExpandEnvironmentVariables($loc) }
    if ($loc -and ($loc -match '\.(ico|exe)$') -and (Test-Path -LiteralPath $loc)) { return $loc }
    $t = $sc.TargetPath
    if ($t -and (Test-Path -LiteralPath $t) -and -not (Test-Path -LiteralPath $t -PathType Container)) { return $t }
  } catch {}
  return $p
}

foreach ($p in [IO.File]::ReadAllLines($List)) {
  if (-not $p) { continue }
  try { $png = [Jumbo]::Png((Resolve-IconSource $p)); if ($png) { [Console]::Out.WriteLine("$p`t$png") } } catch {}
}
