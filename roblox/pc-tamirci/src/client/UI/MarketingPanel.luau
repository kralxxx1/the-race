-- MarketingPanel (phone ▸ Marketing): brand awareness, customer satisfaction and the advertising
-- campaigns that bring more (and richer) customers for a while.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Marketing = require(Shared.Data.Marketing)
local Format = require(Shared.Util.Format)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local MarketingPanel = {}

local win = nil

local function build(content: Instance, rebuild: () -> ())
	Kit.clear(content)
	local d = State.data
	local brand = d and d.brand or { fame = 0, sat = 70, ads = {} }
	local now = os.time()
	local active = Marketing.active(brand, now)

	-- the numbers on top
	local top = Kit.panel(content, { Name = "Summary", Size = UDim2.new(1, 0, 0, 132), BackgroundColor3 = Theme.card })
	Kit.padding(top, 12)
	Kit.label(top, "🌟 " .. S.t("mk_awareness") .. ": <b>" .. S.pick(Marketing.tier(brand.fame)) .. "</b>", { Size = UDim2.new(1, -90, 0, 20), TextSize = 16, TextWrapped = false })
	Kit.label(top, string.format("%d / 100", math.floor(brand.fame)), { Size = UDim2.fromOffset(80, 20), Position = UDim2.new(1, -80, 0, 0), TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Theme.dim, TextSize = 14 })
	local fameBar = Kit.progress(top, { Position = UDim2.fromOffset(0, 26), Size = UDim2.new(1, 0, 0, 10) }, Theme.warn)
	fameBar:set(brand.fame / 100)
	Kit.label(top, "😊 " .. S.t("mk_satisfaction") .. ": <b>" .. math.floor(brand.sat) .. "%</b>", { Position = UDim2.fromOffset(0, 44), Size = UDim2.new(1, 0, 0, 20), TextSize = 16 })
	local satBar = Kit.progress(top, { Position = UDim2.fromOffset(0, 70), Size = UDim2.new(1, 0, 0, 10) }, if brand.sat >= 60 then Theme.good else Theme.bad)
	satBar:set(brand.sat / 100)
	local flow = Marketing.flow(brand, now)
	Kit.label(top, "🚶 " .. S.t("mk_flow", { x = string.format("%.2f", flow), rich = string.format("%.1f", Marketing.richBias(brand, now)) }), { Name = "Flow", Position = UDim2.fromOffset(0, 90), Size = UDim2.new(1, 0, 0, 20), TextSize = 14, TextColor3 = Theme.dim })

	local list = Kit.list(content, { Size = UDim2.new(1, 0, 1, -140), Position = UDim2.fromOffset(0, 140) }, 6)
	for i, c in Marketing.campaigns do
		local left = active[c.id]
		local locked = (d and d.level or 1) < c.level
		local sub = S.t("mk_effect", { boost = math.floor(c.boost * 100 + 0.5), minutes = c.minutes, fame = c.fame })
		local row, right = Kit.row(list, c.icon, S.pick(c.name), sub, { LayoutOrder = i, Name = "Campaign_" .. c.id }, 150)
		if left then
			Kit.pill(right, "▶ " .. Format.duration(left), Theme.good, { Size = UDim2.fromOffset(130, 32), Name = "Running" })
		elseif locked then
			Kit.pill(right, "🔒 " .. S.t("level") .. " " .. c.level, Theme.line, { Size = UDim2.fromOffset(130, 32), Name = "Locked" })
		else
			Kit.button(right, S.t("mk_run") .. " " .. S.money(c.cost), function()
				local r = Net.request("marketing.buy", { id = c.id })
				if r.ok then
					Hud.toast("📣 " .. S.pick(c.name), "good")
					rebuild()
				else
					App.report(r)
				end
			end, { Name = "Run", Size = UDim2.fromOffset(140, 34), TextSize = 14 }, "primary")
		end
		row.Size = UDim2.new(1, 0, 0, 64)
	end
end

function MarketingPanel.open()
	local w = Kit.window(App.screen :: ScreenGui, "📣 " .. S.t("phone_marketing"), Vector2.new(640, 600))
	win = w
	w.root.Name = "MarketingWindow"
	local content = Kit.frame(w.content, { Name = "Body", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) })
	local rebuild
	local conn
	rebuild = function()
		if w.isOpen() then
			build(content, rebuild)
		end
	end
	build(content, rebuild)
	-- timers tick down: refresh every few seconds and whenever the save changes
	conn = State.changed:Connect(rebuild)
	task.spawn(function()
		while w.isOpen() do
			task.wait(5)
			rebuild()
		end
		conn:Disconnect()
	end)
	return w
end

function MarketingPanel.isOpen(): boolean
	return win ~= nil and win.isOpen()
end

return MarketingPanel
