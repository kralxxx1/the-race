local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
require("../../tests/lib/Bootstrap").run("tools/tmp/variety.luau")
local Engine = require("../../tests/lib/Engine")
Engine.context = "server"
local game = Engine.load("build/PCTamirci.rbxlx")
local Avatars = Engine.mod("ReplicatedStorage.Shared.Data.Avatars")
local Vehicles = Engine.mod("ReplicatedStorage.Shared.Data.Vehicles")
local Customers = Engine.mod("ReplicatedStorage.Shared.Data.Customers")
local Mock = require("../../tests/lib/Mock")
local looks = 0
for _ in Avatars.OUTFITS do looks += 1 end
print("outfit looks:", looks)
local seen, n = {}, 0
for look in Avatars.OUTFITS do
	for i = 1, 400 do
		local o = Avatars.outfit(look, Mock.Random.new(i * 7919 + #look))
		local key = { look, o.gender, o.body.name, o.head, o.hair, o.pants or 0, o.skin[1] }
		local ids = {}
		for _, it in o.items do table.insert(ids, it.id) end
		table.sort(ids)
		local k = table.concat(key, ",") .. "|" .. table.concat(ids, ",")
		if not seen[k] then seen[k] = true n += 1 end
	end
end
print("distinct outfits in 400 samples per look:", n)
local cars, kinds = 0, {}
for _, v in Vehicles.list do cars += 1 kinds[v.kind or "?"] = (kinds[v.kind or "?"] or 0) + 1 end
print("dealer vehicles:", cars)
for k, c in kinds do print("  ", k, c) end
local lib = game:GetService("ReplicatedStorage"):FindFirstChild("Assets")
local vlib = lib and lib:FindFirstChild("Vehicles")
print("vehicle kits:", vlib and #vlib:GetChildren() or 0)
local cust = 0
for _ in Customers.types or Customers.list or {} do cust += 1 end
print("customer types:", cust)
os.exit(0)
