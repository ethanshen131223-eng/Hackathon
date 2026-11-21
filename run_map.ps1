# Run both local map services from one PowerShell terminal. Ctrl+C stops this run.
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$mapPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (Test-Path -LiteralPath (Join-Path $projectRoot '.venv-map\Scripts\python.exe')) {
    $mapPython = Join-Path $projectRoot '.venv-map\Scripts\python.exe'
}
$mapNode = (Get-Command node.exe).Source
$mapVite = Join-Path $projectRoot 'web\node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $mapPython)) { throw 'Set up the Python environment using README.md first.' }
if (-not (Test-Path -LiteralPath $mapVite)) { throw 'Run npm install in the web directory first.' }
if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8765 is already serving a map API. Use npm run dev in web, or stop that API before starting another.'
}
$mapApi = Start-Process -FilePath $mapPython -ArgumentList @('-u', 'map_server.py') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
try {
    Write-Host 'MarineGUARDer: http://127.0.0.1:5173'
    Write-Host 'Google Maps key setting: web/.env.local (see web/.env.example).'
    Push-Location (Join-Path $projectRoot 'web')
    try { & $mapNode $mapVite '--host' '127.0.0.1' '--port' '5173' '--strictPort' }
    finally { Pop-Location }
} finally {
    # Windows virtual-environment launchers may own a separate Python child.
    $mapChildren = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($mapApi.Id)" -ErrorAction SilentlyContinue
    foreach ($mapChild in $mapChildren) {
        if ($mapChild.CommandLine -like '*map_server.py*') {
            Stop-Process -Id $mapChild.ProcessId -ErrorAction SilentlyContinue
        }
    }
    if (-not $mapApi.HasExited) { Stop-Process -Id $mapApi.Id -ErrorAction SilentlyContinue }
}
