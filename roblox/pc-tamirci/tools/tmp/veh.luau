local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
require("../../tests/lib/Bootstrap").run("tools/tmp/veh.luau")
local lib = roblox.deserializeModel(fs.readFile("assets/shared/Vehicles.rbxm"))[1]
local m = lib:FindFirstChild("Sedan_white") or lib:GetChildren()[1]
print(m.Name, m:GetAttribute("Size"))
local seen = {}
for _, d in m:GetDescendants() do
	if d:IsA("BasePart") then
		local key = d.Name .. " | " .. tostring(d.Material) .. " | tr " .. string.format("%.2f", d.Transparency) .. (d:GetAttribute("Paint") and " | PAINT" or "") .. (d:GetAttribute("RimOf") and " | rim" or "")
		seen[key] = (seen[key] or 0) + 1
	end
end
for k, v in seen do print(v, k) end
