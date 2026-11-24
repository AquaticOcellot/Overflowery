$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path $PSScriptRoot -Parent
foreach ($flower in @(
  @{ Source = 'flower-blue'; Output = 'flower-blue' },
  @{ Source = 'flower-yellow'; Output = 'flower-yellow' },
  @{ Source = 'flower-purple'; Output = 'flower-purple' },
  @{ Source = 'flower-red'; Output = 'flower-red' },
  @{ Source = 'flower-green'; Output = 'greenery' }
)) {
  foreach ($level in 1..5) {
    $sourcePath = Join-Path $projectRoot "graphics/sprites/$($flower.Source)-level-$level.png"
    $iconPath = Join-Path $projectRoot "graphics/icons/$($flower.Output)-level-$level.png"
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    $icon = [System.Drawing.Bitmap]::new(64, 64, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $canvas = [System.Drawing.Graphics]::FromImage($icon)
    $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
    try {
      $canvas.Clear([System.Drawing.Color]::Transparent)
      $canvas.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $canvas.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $canvas.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, 64, 64), 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
      $icon.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $attributes.Dispose()
      $canvas.Dispose()
      $icon.Dispose()
      $source.Dispose()
    }
  }
}
