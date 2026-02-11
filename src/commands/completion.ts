/**
 * ally completion command - Generate shell completion scripts
 */

type Shell = 'bash' | 'zsh' | 'fish';

// All commands and their options for completion
const COMMANDS = {
  scan: {
    description: 'Scan files for accessibility violations',
    options: ['-o', '--output', '-u', '--url', '-j', '--json', '-f', '--format', '-v', '--verbose', '-t', '--threshold', '--ci', '-F', '--fail-on', '-S', '--simulate', '-s', '--standard', '-T', '--timeout'],
  },
  explain: {
    description: 'Get plain-language explanations of violations',
    options: ['-i', '--input', '-s', '--severity', '-l', '--limit'],
  },
  fix: {
    description: 'Fix accessibility issues using Copilot',
    options: ['-i', '--input', '-s', '--severity', '-a', '--auto', '-d', '--dry-run'],
  },
  report: {
    description: 'Generate accessibility report',
    options: ['-i', '--input', '-o', '--output', '-f', '--format'],
  },
  init: {
    description: 'Initialize ally in your project',
    options: ['-f', '--force', '-H', '--hooks'],
  },
  stats: {
    description: 'Show accessibility progress dashboard',
    options: [],
  },
  badge: {
    description: 'Generate accessibility score badge',
    options: ['-i', '--input', '-f', '--format', '-o', '--output'],
  },
  watch: {
    description: 'Watch for file changes and scan continuously',
    options: ['-d', '--debounce', '--clear'],
  },
  learn: {
    description: 'Learn about WCAG accessibility criteria',
    options: ['-l', '--list'],
  },
  crawl: {
    description: 'Crawl website and scan each page',
    options: ['-d', '--depth', '-l', '--limit', '--same-origin', '--no-same-origin', '-o', '--output'],
  },
  tree: {
    description: 'Display accessibility tree for a URL',
    options: ['-d', '--depth', '-r', '--role', '-j', '--json'],
  },
  triage: {
    description: 'Interactively categorize accessibility issues',
    options: ['-i', '--input'],
  },
  'pr-check': {
    description: 'Post accessibility results to GitHub PR',
    options: ['-i', '--input', '-p', '--pr', '--no-comment', '-F', '--fail-on'],
  },
  completion: {
    description: 'Generate shell completion script',
    options: [],
  },
};

const commandNames = Object.keys(COMMANDS);

function generateBashCompletion(): string {
  return `# Bash completion for ally
# Add to ~/.bashrc or ~/.bash_profile:
#   eval "$(ally completion bash)"

_ally_completions() {
    local cur prev commands
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    commands="${commandNames.join(' ')}"

    # Complete commands
    if [[ \${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        return 0
    fi

    # Complete options based on command
    case "\${COMP_WORDS[1]}" in
${Object.entries(COMMANDS).map(([cmd, info]) => `        ${cmd})
            COMPREPLY=( $(compgen -W "${info.options.join(' ')}" -- "\${cur}") )
            ;;`).join('\n')}
    esac

    return 0
}

complete -F _ally_completions ally
`;
}

function generateZshCompletion(): string {
  return `#compdef ally
# Zsh completion for ally
# Add to ~/.zshrc:
#   eval "$(ally completion zsh)"

_ally() {
    local -a commands
    commands=(
${Object.entries(COMMANDS).map(([cmd, info]) => `        '${cmd}:${info.description}'`).join('\n')}
    )

    _arguments -C \\
        '1:command:->command' \\
        '*::options:->options'

    case $state in
        command)
            _describe 'command' commands
            ;;
        options)
            case $words[1] in
${Object.entries(COMMANDS).map(([cmd, info]) => `                ${cmd})
                    _arguments \\
${info.options.filter(o => o.startsWith('--')).map(opt => `                        '${opt}[${opt.replace('--', '')}]'`).join(' \\\n') || "                        '*:'"}
                    ;;`).join('\n')}
            esac
            ;;
    esac
}

compdef _ally ally
`;
}

function generateFishCompletion(): string {
  return `# Fish completion for ally
# Add to ~/.config/fish/completions/ally.fish:
#   ally completion fish > ~/.config/fish/completions/ally.fish

# Disable file completions for ally
complete -c ally -f

# Commands
${Object.entries(COMMANDS).map(([cmd, info]) => `complete -c ally -n "__fish_use_subcommand" -a "${cmd}" -d "${info.description}"`).join('\n')}

# Options for each command
${Object.entries(COMMANDS).map(([cmd, info]) =>
  info.options.filter(o => o.startsWith('--')).map(opt =>
    `complete -c ally -n "__fish_seen_subcommand_from ${cmd}" -l "${opt.replace('--', '')}" -d "${opt.replace('--', '')}"`
  ).join('\n')
).filter(Boolean).join('\n')}
`;
}

export async function completionCommand(shell?: string): Promise<void> {
  const validShells: Shell[] = ['bash', 'zsh', 'fish'];

  if (!shell) {
    console.log(`Usage: ally completion <shell>

Generate shell completion scripts.

Supported shells:
  bash    Bash completion script
  zsh     Zsh completion script
  fish    Fish completion script

Examples:
  # Bash - add to ~/.bashrc
  eval "$(ally completion bash)"

  # Zsh - add to ~/.zshrc
  eval "$(ally completion zsh)"

  # Fish - save to completions directory
  ally completion fish > ~/.config/fish/completions/ally.fish
`);
    return;
  }

  if (!validShells.includes(shell as Shell)) {
    console.error(`Unknown shell: ${shell}`);
    console.error(`Supported shells: ${validShells.join(', ')}`);
    process.exit(1);
  }

  switch (shell as Shell) {
    case 'bash':
      console.log(generateBashCompletion());
      break;
    case 'zsh':
      console.log(generateZshCompletion());
      break;
    case 'fish':
      console.log(generateFishCompletion());
      break;
  }
}
