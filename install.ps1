# dsh-improved-inline-edit 安装脚本
# 纯插件安装：不改任何 @deepseek-ai/dsh-* 源码。
#   1) 把插件包放进 profiles 的 node_modules（Junction 链接，与其他 dsh 插件同一约定）
#   2) 在 profile 的 cordis.patch.yml 注册一行 insert
#   3) 完全重启 DSH（结束进程，不是关窗口）生效
[CmdletBinding()]
param(
  [string]$PluginSource,
  [string]$ProfileDir,
  [string]$DshHome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $DshHome) { $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' } }
if (-not $ProfileDir) {
  # 优先 desktop profile（桌面版），否则 web
  if (Test-Path (Join-Path $DshHome 'profiles\desktop')) { $ProfileDir = Join-Path $DshHome 'profiles\desktop' }
  else { $ProfileDir = Join-Path $DshHome 'profiles\web' }
}
if (-not $PluginSource) { $PluginSource = $PSScriptRoot }
$PluginSource = (Resolve-Path -LiteralPath $PluginSource).Path

# ---- 读取插件名 ----
$pkg = Get-Content -LiteralPath (Join-Path $PluginSource 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$name = $pkg.name
if (-not $name) { throw 'package.json missing "name"' }
if (-not $pkg.'dsh'.client -or $pkg.'dsh'.client.platform -ne 'web') {
  throw "$name 缺少 dsh.client.platform = web 声明，DSH 客户端不会加载它"
}
if (-not $pkg.exports.'./client') { throw "$name 缺少 exports['./client']，客户端模块系统找不到 bundle" }

Write-Host "-> plugin : $name ($PluginSource)"
Write-Host "-> profile: $ProfileDir"

# ---- 1) 链接到 profiles node_modules ----
$nmDir = Split-Path -Parent $ProfileDir
$target = Join-Path $nmDir 'node_modules'
if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
$link = Join-Path $target $name
if (Test-Path -LiteralPath $link) {
  $it = Get-Item -LiteralPath $link -Force
  if ($it.LinkType -eq 'Junction' -and $it.Target -eq $PluginSource) {
    Write-Host "-> link OK (already exists): $link"
  } else {
    throw "目标已存在但不是指向本插件的 Junction：$link （请先手动删除再重跑）"
  }
} else {
  cmd /c mklink /J "`"$link`"" "`"$PluginSource`"" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    # 无 Junction 权限时退化为复制
    Copy-Item -LiteralPath $PluginSource -Destination $link -Recurse -Force
    Write-Host "-> copied (junction unavailable): $link"
  } else {
    Write-Host "-> junction created: $link"
  }
}

# ---- 验证 require 能解析到 ----
Push-Location $ProfileDir
try {
  $resolved = node -e "console.log(require.resolve('$name/package.json'))" 2>$null
  if (-not $resolved) { throw "require.resolve('$name') 失败——DSH 客户端模块系统将无法加载" }
  Write-Host "-> resolvable: $resolved"
} finally {
  Pop-Location
}

# ---- 2) 注册到 cordis.patch.yml ----
$patchFile = Join-Path $ProfileDir 'cordis.patch.yml'
$patchText = if (Test-Path -LiteralPath $patchFile) { [IO.File]::ReadAllText($patchFile) } else { '' }
# 去掉文件顶部可能的空 `[]`（空 profile 占位）
$patchText = [regex]::Replace($patchText, '(?m)^\s*\[\s*\]\s*\r?\n?', '')
if ($patchText -notmatch "(?m)^\s*- id: $([regex]::Escape($name))\s*$") {
  $patchText = $patchText.TrimEnd() + "`n`n- insert:`n    - id: $name`n      name: '$name'`n"
  [IO.File]::WriteAllText($patchFile, $patchText, [Text.UTF8Encoding]::new($false))
  Write-Host "-> registered in $patchFile"
} else {
  Write-Host "-> already registered in $patchFile"
}

Write-Host ''
Write-Host '安装完成。下一步：'
Write-Host '  1) 完全退出 DSH（不是关窗口，是结束 dsh 进程）'
Write-Host '  2) 重新启动 DSH'
Write-Host '  3) 浏览器刷新页面（若 DSH 自带窗口则重启即可）'
Write-Host '验证：让 agent 跑起来（发一条消息），composer 上方应出现一条「修改要求」输入条，'
Write-Host '  左侧显示随机 deep 系短语（如 Deep diving...），中间输入框随内容自动换行扩展，'
Write-Host '  右侧是黄色实心圆钮。'
