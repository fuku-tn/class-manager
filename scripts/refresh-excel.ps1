# Làm mới (Refresh All) mọi truy vấn Power Query + tính lại công thức trong một file Excel rồi lưu, bằng Excel trên máy.
# Dùng bởi scripts/points-scheduled.cmd trước khi nhập điểm. Cần Microsoft Excel và đang đăng nhập Windows.
# Nếu file đang mở ở nơi khác (chỉ mở được dạng chỉ đọc) thì KHÔNG lưu đè — thoát mã 2, bước nhập dùng bản đã lưu gần nhất.
param([Parameter(Mandatory = $true)][string]$Path, [int]$TimeoutSec = 600)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# Excel bận (đang làm mới) sẽ từ chối lệnh COM (RPC_E_CALL_REJECTED / 0x80010001, 0x8001010A): chờ rồi thử lại.
$deadline = (Get-Date).AddSeconds($TimeoutSec)
function Invoke-Excel([scriptblock]$Action) {
  while ($true) {
    try { return & $Action }
    catch {
      $busy = $_.Exception.Message -match '0x80010001|0x8001010A|RPC_E_CALL_REJECTED|RPC_E_SERVERCALL_RETRYLATER'
      if (-not $busy -or (Get-Date) -gt $deadline) { throw }
      Start-Sleep -Milliseconds 500
    }
  }
}

$xl = $null; $wb = $null
try {
  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false
  $wb = Invoke-Excel { $xl.Workbooks.Open($Path, 0, $false) }
  if (Invoke-Excel { $wb.ReadOnly }) { Write-Output "Bỏ qua làm mới: file đang mở ở nơi khác (chỉ đọc) — nhập điểm từ bản đã lưu gần nhất."; exit 2 }
  foreach ($c in (Invoke-Excel { @($wb.Connections) })) { try { $c.OLEDBConnection.BackgroundQuery = $false } catch {} }   # làm mới tuần tự
  $t0 = Get-Date
  Invoke-Excel { $wb.RefreshAll() } | Out-Null
  Invoke-Excel { $xl.CalculateUntilAsyncQueriesDone() } | Out-Null
  Invoke-Excel { $xl.CalculateFull() } | Out-Null
  Invoke-Excel { $wb.Save() } | Out-Null
  Write-Output ("Đã làm mới và lưu file Excel trong {0:N1} giây." -f ((Get-Date) - $t0).TotalSeconds)
  exit 0
} catch {
  Write-Output ("LỖI làm mới Excel: " + $_.Exception.Message)
  exit 1
} finally {
  if ($wb) { try { Invoke-Excel { $wb.Close($false) } | Out-Null } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  if ($xl) { try { Invoke-Excel { $xl.Quit() } | Out-Null } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
