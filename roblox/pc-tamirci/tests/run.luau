-- Test runner:  lune run tests/run.luau [filter]
-- Builds the place with Rojo, loads it into the headless engine and runs every spec in tests/specs.

local process = require("@lune/process")
local fs = require("@lune/fs")

local filter = process.args[1]

require("./lib/Bootstrap").run("tests/run.luau")

local T = { passed = 0, failed = 0, failures = {} }

function T.test(name: string, fn: () -> ())
	if filter and not T.specMatches and not string.find(name, filter, 1, true) then
		return
	end
	local t0 = os.clock()
	local ok, err = xpcall(fn, function(e)
		return tostring(e) .. "\n" .. debug.traceback(nil, 2)
	end)
	local ms = math.floor((os.clock() - t0) * 1000)
	if ok then
		T.passed += 1
		print(string.format("  ✓ %s (%d ms)", name, ms))
	else
		T.failed += 1
		table.insert(T.failures, { name = name, err = err })
		print(string.format("  ✗ %s\n%s", name, err))
	end
end

function T.eq(a, b, msg: string?)
	if a ~= b then
		error(string.format("%s: expected %s, got %s", msg or "eq", tostring(b), tostring(a)), 2)
	end
end

function T.near(a, b, eps: number, msg: string?)
	if type(a) ~= "number" or math.abs(a - b) > eps then
		error(string.format("%s: expected %s ± %s, got %s", msg or "near", tostring(b), tostring(eps), tostring(a)), 2)
	end
end

function T.ok(cond, msg: string?)
	if not cond then
		error(msg or "assertion failed", 2)
	end
end

local specs = {}
for _, name in fs.readDir("tests/specs") do
	if string.match(name, "%.luau$") then
		table.insert(specs, name)
	end
end
table.sort(specs)

for _, name in specs do
	print("● " .. name)
	T.specMatches = filter ~= nil and string.find(name, filter, 1, true) ~= nil
	-- every spec gets a fresh process-level engine state via its own load
	local spec = require("./specs/" .. string.gsub(name, "%.luau$", ""))
	local ok, err = pcall(spec, T)
	if not ok then
		T.failed += 1
		table.insert(T.failures, { name = name, err = tostring(err) })
		print("  ✗ spec crashed: " .. tostring(err))
	end
end

print(string.format("\n%d passed, %d failed", T.passed, T.failed))
-- exit explicitly: service loops started by the server specs never finish on their own
process.exit(if T.failed > 0 then 1 else 0)
