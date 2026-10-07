Get-CimInstance Win32_Process -Filter "name='node.exe'" | ForEach-Object {
  $cl = $_.CommandLine -replace '\s+', ' '
  Write-Output ("{0} ppid={1} :: {2}" -f $_.ProcessId, $_.ParentProcessId, $cl.Substring(0, [Math]::Min(150, $cl.Length)))
}
