local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local process = require("@lune/process")
require("../../tests/lib/Bootstrap").run("tools/tmp/parts.luau")
local lib = roblox.deserializeModel(fs.readFile("assets/server/Interior.rbxm"))[1]
for _, name in process.args do
	local m = lib:FindFirstChild(name)
	print("== " .. name, m:GetAttribute("Size"))
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d.Name ~= "Root" then
			local p, s = d.CFrame.Position, d.Size
			print(string.format("  %-28s pos %5.1f %5.1f %5.1f  size %4.1f %4.1f %4.1f", d.Name, p.X, p.Y, p.Z, s.X, s.Y, s.Z))
		end
	end
end
