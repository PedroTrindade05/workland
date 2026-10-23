# O que está tocando no Windows (Spotify, YouTube no navegador, etc.) via controles de mídia do sistema.
# -Cmd status|play|next|prev  -ArtDir <pasta>  ->  imprime JSON { title, artist, album, app, playing, art, pos, dur, at }
# A capa vai pra um arquivo em ArtDir (um por música) e só é lida da primeira vez.
param([string]$Cmd = 'status', [string]$ArtDir = '')
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

  # capa: arquivo por música (nome = hash de título, artista, álbum e app)
  $art = $null
  if ($ArtDir -and $p.Thumbnail) {
    try {
      $key = "$($p.Title)|$($p.Artist)|$($p.AlbumTitle)|$($s.SourceAppUserModelId)"
      $md5 = [Security.Cryptography.MD5]::Create()
      $hash = -join ($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object { $_.ToString('x2') })
      $file = Join-Path $ArtDir "$hash.img"
      if (-not (Test-Path $file)) {
        New-Item -ItemType Directory -Force -Path $ArtDir | Out-Null
        [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
        [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
        $stream = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        # pela reflexão: o PowerShell não acha a sobrecarga de AsStreamForRead sozinho
        $toNet = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
        $net = $toNet.Invoke($null, @($stream))
        $ms = New-Object IO.MemoryStream
        $net.CopyTo($ms)
        if ($ms.Length -gt 0) { [IO.File]::WriteAllBytes($file, $ms.ToArray()) }
        # guarda só as 40 mais recentes
        Get-ChildItem $ArtDir -Filter *.img | Sort-Object LastWriteTime -Descending | Select-Object -Skip 40 | Remove-Item -Force -ErrorAction SilentlyContinue
      }
      if (Test-Path $file) { $art = $file }
    } catch {}
  }

  # linha do tempo (posição no momento da última atualização; a tela anda o resto sozinha)
  $pos = $null; $dur = $null; $at = $null
  try {
    $t = $s.GetTimelineProperties()
    if ($t.EndTime.TotalSeconds -gt 0) {
      $pos = [math]::Round($t.Position.TotalSeconds, 1)
      $dur = [math]::Round(($t.EndTime - $t.StartTime).TotalSeconds, 1)
      $at = $t.LastUpdatedTime.ToUnixTimeMilliseconds()
    }
  } catch {}

  $playing = $s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing'
  [pscustomobject]@{ title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; app = $s.SourceAppUserModelId; playing = $playing; art = $art; pos = $pos; dur = $dur; at = $at } | ConvertTo-Json -Compress
} catch {
  'null'
}
