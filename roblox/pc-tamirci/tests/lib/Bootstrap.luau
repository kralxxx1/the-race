-- Points Lune at the patched reflection database (see tests/tools/patch_reflection.py) and
-- builds the place with Rojo. Must run before anything touches @lune/roblox instances.

local fs = require("@lune/fs")
local process = require("@lune/process")

local Bootstrap = {}

local DB = "build/reflection.msgpack"
local ENGINE = "tests/lib/Engine.luau"

local function stamp(path: string): number
	local ok, meta = pcall(fs.metadata, path)
	if not ok or not meta.exists or not meta.modifiedAt then
		return -1
	end
	return meta.modifiedAt.unixTimestampMillis
end

-- script: the entry script (relative to the project root), re-run under the patched database
function Bootstrap.run(script: string, placePath: string?)
	local dbPath = process.cwd .. DB
	if process.env.RBX_DATABASE ~= dbPath then
		if stamp(DB) < stamp(ENGINE) or stamp("tests/tools/patch_reflection.py") > stamp(DB) then
			local r = process.exec("python3", { "tests/tools/patch_reflection.py", DB })
			if not r.ok then
				print(r.stdout .. r.stderr)
				error("could not build the reflection database (pip install msgpack)")
			end
		end
		-- the database is read from the real environment, so restart under it
		local args = { "run", script }
		for _, a in process.args do
			table.insert(args, a)
		end
		local env = {}
		for k, v in process.env do
			env[k] = v
		end
		env.RBX_DATABASE = dbPath
		local child = process.exec("lune", args, { env = env, stdio = "inherit" })
		process.exit(child.code)
	end
	local build = process.exec("rojo", { "build", "default.project.json", "-o", placePath or "build/PCTamirci.rbxlx" })
	if not build.ok then
		print(build.stderr)
		process.exit(1)
	end
end

return Bootstrap
