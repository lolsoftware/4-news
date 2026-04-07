@echo off
echo Usuwanie cache artykulow na serwerze (branch gh-pages)...
git push origin --delete gh-pages
echo Cache wyczyszczony. Uruchamianie pipeline...
gh workflow run process.yml
echo Gotowe. Pipeline przetworzy wszystkie artykuly od nowa.
echo Po zakonczeniu pipeline, uruchom: gh api repos/lolsoftware/4-news/pages -X POST --input - ^^^< nul
pause
