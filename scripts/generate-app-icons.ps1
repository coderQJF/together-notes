param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePath,
  [string]$OutputDirectory = "src/static/app-icons"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourceFile = (Resolve-Path -LiteralPath $SourcePath).Path
$targetDirectory = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
[System.IO.Directory]::CreateDirectory($targetDirectory) | Out-Null

function New-Canvas([int]$width, [int]$height, [bool]$transparent) {
  $canvas = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $canvas.SetResolution(96, 96)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    if ($transparent) {
      $graphics.Clear([System.Drawing.Color]::Transparent)
    } else {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#FAF8F2"))
    }
  } finally {
    $graphics.Dispose()
  }
  return $canvas
}

function Draw-Scaled([System.Drawing.Bitmap]$source, [int]$size, [bool]$transparent) {
  $canvas = New-Canvas $size $size $transparent
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $size, $size)
  } finally {
    $graphics.Dispose()
  }
  return $canvas
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$name) {
  $path = Join-Path $targetDirectory $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "$name ($($bitmap.Width)x$($bitmap.Height))"
}

$source = [System.Drawing.Bitmap]::new($sourceFile)
try {
  $master = Draw-Scaled $source 1024 $false
  try { Save-Png $master "app-icon-1024.png" } finally { $master.Dispose() }

  foreach ($size in @(48, 72, 96, 144, 192)) {
    $icon = Draw-Scaled $source $size $false
    try { Save-Png $icon "app-icon-$size.png" } finally { $icon.Dispose() }
  }

  foreach ($size in @(18, 24, 36, 48, 72, 96)) {
    $mask = Draw-Scaled $source $size $true
    try {
      for ($x = 0; $x -lt $size; $x++) {
        for ($y = 0; $y -lt $size; $y++) {
          $pixel = $mask.GetPixel($x, $y)
          $alpha = if ($pixel.A -ge 96) { 255 } else { 0 }
          $mask.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
        }
      }
      Save-Png $mask "push-small-$size.png"
    } finally {
      $mask.Dispose()
    }
  }
} finally {
  $source.Dispose()
}
