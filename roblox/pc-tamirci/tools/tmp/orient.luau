local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
require("../../tests/lib/Bootstrap").run("tools/tmp/orient.luau")
local lib = roblox.deserializeModel(fs.readFile("assets/server/Interior.rbxm"))[1]
for _, m in lib:GetChildren() do
	local sz = m:GetAttribute("Size")
	local upper, upperW, handle, handleW = 0, 0, 0, 0
	local all, allW = 0, 0
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d.Name ~= "Root" then
			local p, s = d.CFrame.Position, d.Size
			local vol = s.X * s.Y * s.Z
			all += p.Z * vol
			allW += vol
			if p.Y > sz.Y * 0.55 then
				upper += p.Z * vol
				upperW += vol
			end
			local n = string.lower(d.Name)
			if string.find(n, "handle") or string.find(n, "knob") or string.find(n, "pull") then
				handle += p.Z
				handleW += 1
			end
		end
	end
	print(string.format("%-18s size %4.1f %4.1f %4.1f  allZ %6.2f  upperZ %6.2f  handleZ %s", m.Name, sz.X, sz.Y, sz.Z, allW > 0 and all / allW or 0, upperW > 0 and upper / upperW or 0, handleW > 0 and string.format("%.2f", handle / handleW) or "-"))
end
