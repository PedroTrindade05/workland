# O que está tocando no Windows (Spotify, YouTube no navegador, etc.) via controles de mídia do sistema.
# -Cmd status|play|next|prev  ->  imprime JSON { title, artist, app, playing, art }
param([string]$Cmd = 'status')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $s = $mgr.GetCurrentSession()
  if (-not $s) { 'null'; exit }
  switch ($Cmd) {
    'play' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null; Start-Sleep -Milliseconds 250 }
    'next' { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null; Start-Sleep -Milliseconds 500 }
    'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null; Start-Sleep -Milliseconds 500 }
  }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $art = $null
  if ($p.Thumbnail) {
    try {
      $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
      $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
      $ms = New-Object IO.MemoryStream
      $net.CopyTo($ms)
      $art = 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray())
    } catch {}
  }
  $playing = $s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'
  [pscustomobject]@{ title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId; playing = $playing; art = $art } | ConvertTo-Json -Compress
} catch {
  'null'
}
