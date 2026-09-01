Add-Type -AssemblyName System.Drawing

function New-Icon {
    param([int]$Size, [double]$ContentFrac, [string]$Path)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # full-bleed background so the icon survives Android's maskable crop
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#101420"))
    $g.FillRectangle($bg, 0, 0, $Size, $Size)

    $content = [int]($Size * $ContentFrac)
    $gap     = [Math]::Max(2, [int]($content * 0.056))
    $block   = [int](($content - $gap) / 2)
    $radius  = [Math]::Max(2, [int]($block * 0.19))
    $ox      = [int](($Size - ($block * 2 + $gap)) / 2)
    $oy      = $ox

    # a corner tromino in blue, one amber block completing the square
    $cells = @(
        @{ r = 0; c = 0; hex = "#4f9dff" },
        @{ r = 0; c = 1; hex = "#ffb038" },
        @{ r = 1; c = 0; hex = "#4f9dff" },
        @{ r = 1; c = 1; hex = "#4f9dff" }
    )

    foreach ($cell in $cells) {
        $x = $ox + $cell.c * ($block + $gap)
        $y = $oy + $cell.r * ($block + $gap)
        $d = $radius * 2

        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddArc($x, $y, $d, $d, 180, 90)
        $gp.AddArc($x + $block - $d, $y, $d, $d, 270, 90)
        $gp.AddArc($x + $block - $d, $y + $block - $d, $d, $d, 0, 90)
        $gp.AddArc($x, $y + $block - $d, $d, $d, 90, 90)
        $gp.CloseFigure()

        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($cell.hex))
        $g.FillPath($brush, $gp)

        # the same top highlight / bottom shadow the in-game cells carry
        $lip = [Math]::Max(1, [int]($block * 0.07))
        $old = $g.Clip
        $g.SetClip($gp)
        $hi = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(56, 255, 255, 255))
        $g.FillRectangle($hi, $x, $y, $block, $lip)
        $sh = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(72, 0, 0, 0))
        $g.FillRectangle($sh, $x, $y + $block - $lip, $block, $lip)
        $g.Clip = $old
        $hi.Dispose(); $sh.Dispose(); $brush.Dispose(); $gp.Dispose()
    }

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "wrote $Path"
}

$dir = Join-Path $PSScriptRoot "icons"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
New-Icon -Size 512 -ContentFrac 0.5625 -Path "$dir\icon-512.png"
New-Icon -Size 192 -ContentFrac 0.5625 -Path "$dir\icon-192.png"
New-Icon -Size 180 -ContentFrac 0.76   -Path "$dir\apple-touch-icon.png"
