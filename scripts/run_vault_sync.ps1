$url = "https://bdt-telegram-bot.fawzy-sukkar2005.workers.dev/api/sync-vault-step?key=bdt_sync_vault_2026&batch=15"
$step = 1

Write-Host "=================================================="
Write-Host "Starting Automated Full Vault Synchronization..."
Write-Host "=================================================="

while ($true) {
    try {
        $res = Invoke-RestMethod -Uri $url -TimeoutSec 45
        Write-Host "Step $step : Transferred $($res.totalTransferred) / $($res.total) ($($res.percent)%) | Remaining: $($res.remaining)"
        
        if ($res.isComplete -eq $true -or $res.remaining -le 0) {
            Write-Host "=================================================="
            Write-Host "Vault Synchronization Completed 100% Successfully!"
            Write-Host "=================================================="
            break
        }
        
        $step++
        Start-Sleep -Milliseconds 800
    }
    catch {
        Write-Host "Warning in step: $($_.Exception.Message). Retrying in 2 seconds..."
        Start-Sleep -Seconds 2
    }
}
