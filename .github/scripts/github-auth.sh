# Gives git the token of the workflow for github.com, and nothing else. It is read ("sourced") by the steps of a workflow that push, with the token in GH_TOKEN:
#
#   . .github/scripts/github-auth.sh
#
# The credential is the header that GitHub's own actions give git (a basic credential made of the name x-access-token and the token, in base64), and it is handed to git by
# the environment (GIT_CONFIG_COUNT and the two variables that follow it), so that it is not in an address, not on the command line of any program (where `ps` shows it), not
# in a file, and not printed. Every git that the step starts has it, and so has every git that the Desk starts, because the Desk keeps the variables of git
# (desk/src/run/environment.ts). It is for github.com alone: git sends it to no other host. The checkout is made with persist-credentials: false, so nothing else gives git
# the token. Nothing here prints anything, and nothing here is run with a trace.
if [ -z "${GH_TOKEN:-}" ]; then
  echo 'github-auth: GH_TOKEN is not set, so git has no credential' >&2
  return 1 2>/dev/null || exit 1
fi
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0='http.https://github.com/.extraheader'
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
