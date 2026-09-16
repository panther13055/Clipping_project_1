$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Ranking Shorts Maker - FREE Local AI setup' -ForegroundColor Cyan
Write-Host '-------------------------------------------'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ToolDir = Join-Path $Root 'tools\realesrgan'
$Exe = Join-Path $ToolDir 'realesrgan-ncnn-vulkan.exe'
$ZipUrl = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip'

if (Test-Path $Exe) {
    Write-Host 'Real-ESRGAN is already installed.' -ForegroundColor Green
} else {
    Write-Host 'Downloading official Real-ESRGAN NCNN/Vulkan package...'
    $Temp = Join-Path $env:TEMP ('ranking-real-esrgan-' + [guid]::NewGuid().ToString('N'))
    $Zip = Join-Path $Temp 'realesrgan.zip'
    $Extract = Join-Path $Temp 'extract'
    New-Item -ItemType Directory -Force -Path $Temp | Out-Null
    New-Item -ItemType Directory -Force -Path $Extract | Out-Null

    try {
        Invoke-WebRequest -Uri $ZipUrl -OutFile $Zip -UseBasicParsing
        Write-Host 'Extracting...'
        Expand-Archive -Path $Zip -DestinationPath $Extract -Force

        $FoundExe = Get-ChildItem -Path $Extract -Recurse -Filter 'realesrgan-ncnn-vulkan.exe' | Select-Object -First 1
        if (-not $FoundExe) {
            throw 'Could not find realesrgan-ncnn-vulkan.exe in the downloaded package.'
        }

        $PackageDir = $FoundExe.Directory.FullName
        New-Item -ItemType Directory -Force -Path $ToolDir | Out-Null
        Copy-Item -Path (Join-Path $PackageDir '*') -Destination $ToolDir -Recurse -Force

        if (-not (Test-Path $Exe)) {
            throw 'Real-ESRGAN extraction finished, but the executable is still missing.'
        }

        Write-Host 'Real-ESRGAN installed successfully.' -ForegroundColor Green
    }
    finally {
        Remove-Item -Path $Temp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$Ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$Ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue

if ($Ffmpeg -and $Ffprobe) {
    Write-Host 'FFmpeg and ffprobe are ready.' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host 'FFmpeg/ffprobe were not found in PATH.' -ForegroundColor Yellow
    Write-Host 'The neural engine is installed, but video processing also needs FFmpeg.'
    Write-Host 'Install FFmpeg, reopen this folder, then run START_LOCAL_AI.bat again.'
}

Write-Host ''
Write-Host ('Installed at: ' + $ToolDir)
Write-Host 'No Topaz key, paid API, CUDA or PyTorch is required for this NCNN/Vulkan build.'
