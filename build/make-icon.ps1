# Gera o ícone do app (256px): placa escura com o anel dourado da marca
param([string]$Out)
Add-Type -AssemblyName System.Drawing
$S = 256
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r, $r, 180, 90)
  $p.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
  $p.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
  $p.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
  $p.CloseFigure()
  return $p
}

$plate = RoundRect 8 8 240 240 72
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 256, 256), ([System.Drawing.Color]::FromArgb(255, 28, 32, 52)), ([System.Drawing.Color]::FromArgb(255, 8, 9, 13))
$g.FillPath($bg, $plate)
$edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 255, 255, 255)), 2
$g.DrawPath($edge, $plate)

# brilho do anel
for ($i = 14; $i -ge 1; $i--) {
  $a = [int](10 * (15 - $i) / 14)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($a, 217, 178, 124)), (10 + $i * 3)
  $g.DrawEllipse($pen, 72, 72, 112, 112)
}
$ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 226, 190, 136)), 11
$g.DrawEllipse($ring, 72, 72, 112, 112)
$dot = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 210, 160))
$g.FillEllipse($dot, 106, 106, 44, 44)

$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
