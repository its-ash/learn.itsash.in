.PHONY: deploy

deploy:
	npm run generate
	git add .
	MSG=$$(copilot -p "Generate a concise conventional commit message for the staged changes. Output only the message on a single line, no quotes, no code blocks." 2>/dev/null || echo "deploy: regenerate static site") && \
	git commit -m "$$MSG"
	git push origin main