param(
    [int]$Port = 8080
)

$root = $PSScriptRoot
$mimeTypes = @{
    '.html' = 'text/html'
    '.css'  = 'text/css'
    '.js'   = 'application/javascript'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Error "Failed to start server on port $Port. $_"
    exit 1
}

Write-Host "Serving $root at $prefix (Ctrl+C to stop)"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = [Uri]::UnescapeDataString($request.Url.AbsolutePath)
        $fullRoot = [System.IO.Path]::GetFullPath($root)
        $resolvedFile = $null

        # 1. A trailing slash (including bare "/") means "serve the directory's
        #    index.html", same as GitHub Pages does for a real directory path —
        #    this is what makes admin/ (not admin/index.html) work locally too.
        if ($urlPath.EndsWith('/')) {
            $candidate = Join-Path $root (($urlPath + 'index.html').TrimStart('/'))
            $full = [System.IO.Path]::GetFullPath($candidate)
            if ($full.StartsWith($fullRoot) -and (Test-Path $full -PathType Leaf)) {
                $resolvedFile = $full
            }
        } else {
            # 2. Exact file match (e.g. /style.css, /shared.js).
            $candidate = Join-Path $root $urlPath.TrimStart('/')
            $full = [System.IO.Path]::GetFullPath($candidate)
            if ($full.StartsWith($fullRoot) -and (Test-Path $full -PathType Leaf)) {
                $resolvedFile = $full
            }

            # 3. Extension-less clean URL (e.g. /admin) — try <path>.html, then
            #    <path>/index.html, mirroring how GitHub Pages resolves these.
            if (-not $resolvedFile -and -not [System.IO.Path]::HasExtension($urlPath)) {
                foreach ($suffix in @('.html', '/index.html')) {
                    $candidate = Join-Path $root ($urlPath.TrimStart('/') + $suffix)
                    $full = [System.IO.Path]::GetFullPath($candidate)
                    if ($full.StartsWith($fullRoot) -and (Test-Path $full -PathType Leaf)) {
                        $resolvedFile = $full
                        break
                    }
                }
            }
        }

        # 4. /review/<id> is a virtual route, not a real file — serve the root
        #    index.html directly (a real 200, unlike GitHub Pages, which can
        #    only fake this via the 404.html redirect trick; see
        #    docs/fragile-solutions.md). index.html's own bootstrap script
        #    reads the still-correct URL to figure out which review that is.
        if (-not $resolvedFile -and $urlPath -match '^/review/[^/]+/?$') {
            $resolvedFile = Join-Path $root 'index.html'
        }

        if ($resolvedFile) {
            $ext = [System.IO.Path]::GetExtension($resolvedFile).ToLower()
            $contentType = $mimeTypes[$ext]
            if (-not $contentType) { $contentType = 'application/octet-stream' }

            $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFound = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
            $response.OutputStream.Write($notFound, 0, $notFound.Length)
        }

        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
