# ETF 仪表盘

本项目复原了截图中的“ETF 仪表盘”页面，并以公开数据源重建沪深 300 ETF 份额曲线。

## 数据源

- 沪深 300 ETF：510300、510310、159919、510330，使用沪深交易所日终份额。
- 中证 500 ETF：510500、159922、512500，使用沪深交易所日终份额。
- 中证 A500：563360、159352、159361、159338、512050。
- 上证 50：510050、510100、530000。
- 融资融券：上海证券交易所和深圳证券交易所融资融券每日数据。
- 煤炭价格：CCTD 环渤海动力煤 Q5500K、Q5000K、Q4500K。
- 电解铝与氧化铝：SMM A00 铝和山西氧化铝日度价格、最低价、最高价及价差。
- 黄金储备：国家外汇管理局官方储备资产。
- SCFI：上海航运交易所。
- 水电与水位：长江电力公告、三峡集团、长江水利委员会。

每个菜单项的数据源、字段、更新频率和口径说明位于
`data/data-sources.json`。

## 更新 ETF 数据

```powershell
python .\scripts\fetch_etf_data.py
python .\scripts\fetch_commodity_data.py
```

脚本分别输出 `data/etf-boards.json` 和 `data/commodity-data.json`。

## 运行

双击 `start-etf-dashboard.cmd`。服务启动后会自动打开
`http://127.0.0.1:8017/`。

每次打开网页时，页面会调用本地自动更新接口，检查并抓取最新数据；成功后
卡片和曲线会自动刷新，不需要手工运行抓取脚本。更新检查在后台执行，最近
15 分钟已经检查过时会直接使用现有数据。

命令行启动方式：

```powershell
cd D:\test-codex\etf-dashboard
python .\scripts\serve.py --open
```

## 发布为固定公网网址

第一次发布需要 GitHub 账号和一次性授权：

1. 打开 GitHub 的
   [Classic Token 创建页](https://github.com/settings/tokens/new?scopes=repo,workflow&description=ETF%20Dashboard)。
2. 勾选 `repo` 与 `workflow`，生成令牌。
3. 在 PowerShell 中运行：

```powershell
cd D:\test-codex\etf-dashboard
python .\scripts\publish_github.py
```

令牌输入过程不会回显，也不会写入项目文件。脚本会自动创建
`etf-market-dashboard` 仓库、上传页面、开启 GitHub Pages，并输出类似
`https://<用户名>.github.io/etf-market-dashboard/` 的固定网址。

仓库内的 GitHub Actions 会在每个工作日 17:35（北京时间）尝试更新数据并重新部署。
