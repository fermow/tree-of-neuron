PORT ?= 8989
HOST ?= 127.0.0.1

.PHONY: up serve check help

up: serve

serve:
	@echo "Tree of Neuron → http://$(HOST):$(PORT)"
	@python3 -m http.server $(PORT) --bind $(HOST)

check:
	@node --check assets/organic-layout.js
	@node --check assets/relations.js
	@node --check assets/explorer.js
	@node --check assets/atlas.js
	@node --check assets/media.js
	@node --check assets/reader.js
	@node --check assets/data.js
	@node --check assets/graph.js
	@node --check assets/visuals.js
	@node --check assets/tree.js
	@node --check assets/event.js
	@node --check assets/research.js
	@node --check assets/terms.js
	@node --check assets/term.js
	@node scripts/check-content.js
	@node scripts/check-atlas.js
	@node scripts/check-explorer.js
	@node scripts/check-relationships.js

help:
	@echo "make up       Start the site on http://127.0.0.1:8989"
	@echo "make check    Validate JavaScript syntax"
	@echo "PORT=9000 make up    Use another port"
