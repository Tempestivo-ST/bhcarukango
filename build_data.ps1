$dir = "C:\Users\Rafael Alemida\.gemini\antigravity\scratch\geoportal\public\data"
$outFile = "C:\Users\Rafael Alemida\.gemini\antigravity\scratch\geoportal\data_layers.js"

Set-Content $outFile "window.GeoportalData = {};`n" -Encoding UTF8

$geojsons = Get-ChildItem "$dir\*.geojson"
foreach ($f in $geojsons) {
    $name = $f.Name
    Add-Content $outFile "window.GeoportalData['$name'] = " -Encoding UTF8
    $content = Get-Content $f.FullName -Raw
    Add-Content $outFile $content -Encoding UTF8
    Add-Content $outFile ";`n" -Encoding UTF8
}

$tifs = Get-ChildItem "$dir\*.tif"
foreach ($f in $tifs) {
    $name = $f.Name
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $b64 = [System.Convert]::ToBase64String($bytes)
    Add-Content $outFile "window.GeoportalData['$name'] = '$b64';`n" -Encoding UTF8
}
