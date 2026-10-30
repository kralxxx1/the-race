local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local process = require("@lune/process")
require("../../tests/lib/Bootstrap").run("tools/tmp/listpack.luau")
local id = process.args[1]
local roots = roblox.deserializeModel(fs.readFile("build/packs/" .. id .. ".rbxm"))
local function count(c)
	local n = 0
	for _, d in c:GetDescendants() do
		if d:IsA("BasePart") then
			n += 1
		end
	end
	return n
end
local function walk(n, depth)
	for _, c in n:GetChildren() do
		if c:IsA("Model") or c:IsA("Folder") then
			print(string.rep("  ", depth) .. c.ClassName:sub(1, 1) .. " " .. c.Name .. " (" .. count(c) .. ")")
			if c:IsA("Folder") then
				walk(c, depth + 1)
			end
		end
	end
end
for _, r in roots do
	print(r.ClassName .. " " .. r.Name)
	walk(r, 1)
end
