$port = 8080
$path = $PSScriptRoot
$listener = New-Object System.Net.HttpListener

# Tenta encontrar uma porta livre se a 8080 estiver ocupada
$maxTries = 10
$tryCount = 0
$connected = $false

while (-not $connected -and $tryCount -lt $maxTries) {
    try {
        $listener.Prefixes.Clear()
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        $connected = $true
    } catch {
        $port++
        $tryCount++
    }
}

if (-not $connected) {
    Write-Host "Não foi possível iniciar o servidor. Portas ocupadas." -ForegroundColor Red
    exit
}

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  GeoPortal Local Server Iniciado com Sucesso! " -ForegroundColor Cyan
Write-Host "  Porta: $port                                 " -ForegroundColor Cyan
Write-Host "  NÃO FECHE ESTA JANELA ENQUANTO USA O MAPA!   " -ForegroundColor Yellow
Write-Host "===============================================" -ForegroundColor Cyan

# Abre o navegador
Start-Process "http://localhost:$port/"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    
    $reqPath = $context.Request.Url.LocalPath
    if ($reqPath -eq "/") { $reqPath = "/index.html" }
    
    # Remove a barra inicial para funcionar no Join-Path corretamente
    if ($reqPath.StartsWith("/")) {
        $reqPath = $reqPath.Substring(1)
    }
    
    $filePath = Join-Path $path $reqPath
    
    if (Test-Path $filePath -PathType Leaf) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            if ($ext -eq ".html") { $response.ContentType = "text/html" }
            elseif ($ext -eq ".css") { $response.ContentType = "text/css" }
            elseif ($ext -eq ".js") { $response.ContentType = "application/javascript" }
            elseif ($ext -eq ".geojson") { $response.ContentType = "application/geo+json" }
            elseif ($ext -eq ".tif" -or $ext -eq ".tiff") { $response.ContentType = "image/tiff" }
            
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            
            $output = $response.OutputStream
            $output.Write($bytes, 0, $bytes.Length)
            $output.Close()
        } catch {
            $response.StatusCode = 500
            $response.Close()
        }
    } else {
        $response.StatusCode = 404
        $response.Close()
    }
}
