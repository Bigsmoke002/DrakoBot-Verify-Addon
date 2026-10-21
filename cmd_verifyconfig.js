// cmd_verifyconfig.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'verify_config.json');

// Helper-Funktion, um die Config zu laden (Standardwerte, falls nicht vorhanden)
function getConfig() {
  let config = {
    port: 8084,
    role: "",
    verifyLink: "http://localhost:8084",
    verificationLevel: 4,
    joinRole: "",
    removeRole: "", // Neue Eigenschaft hinzugefügt
    redirectLink: ""
  };
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const userConfig = JSON.parse(raw);
      config = { ...config, ...userConfig };
    } catch (err) {
      console.error('Fehler beim Lesen der verify_config.json:', err);
    }
  }
  return config;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Fehler beim Speichern der verify_config.json:', err);
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verifyconfig')
    .setDescription('Konfiguriere das Verifizierungssystem.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('level')
        .setDescription('Konfiguriere den Verifizierungs-Level (1-5).')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('Wähle den Verifizierungs-Level (1-5)')
            .setRequired(true)
            .addChoices(
              { name: '1 - Nur Verify Button (sofort Rolle)', value: 1 },
              { name: '2 - Verify Button + Mathe-Aufgabe', value: 2 },
              { name: '3 - Verify Button + Verify Link', value: 3 },
              { name: '4 - Verify Button + Verify Link + Mathe-Aufgabe', value: 4 },
              { name: '5 - Verify Button + Verify Link + Mathe-Aufgabe + Texteingabe', value: 5 }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('role')
        .setDescription('Setze die Rolle, die nach erfolgreicher Verifizierung hinzugefügt wird.')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Wähle die Rolle, die bei erfolgreicher Verifizierung hinzugefügt wird.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('joinrole')
        .setDescription('Setze die Rolle, die bei Server-Beitritt automatisch vergeben wird.')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Wähle die Rolle, die bei Server-Beitritt vergeben wird.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('removerole')
        .setDescription('Setze die Rolle, die nach erfolgreicher Verifizierung entfernt wird.')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Wähle die Rolle, die bei erfolgreicher Verifizierung entfernt wird.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('redirect')
        .setDescription('Setze den Redirect-Link nach Verifizierung.')
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Der Discord-Link, zu dem nach erfolgreicher Verifizierung weitergeleitet wird.')
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    try {
      // Nur Administratoren dürfen diese Einstellung vornehmen.
      if (!interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({ content: 'Du hast keine Berechtigung, diese Konfiguration zu ändern.', ephemeral: true });
      }
      
      let config = getConfig();
      const subcommand = interaction.options.getSubcommand();
      
      // Level-Konfiguration
      if (subcommand === 'level') {
        const level = interaction.options.getInteger('level');
        config.verificationLevel = level;
        
        // Erklärung zum gewählten Level
        let explanation = '';
        switch (level) {
          case 1:
            explanation = 'Stufe 1: Nur der Verify-Button wird gedrückt. Der User erhält sofort die Rolle, ohne weitere Eingaben.';
            break;
          case 2:
            explanation = 'Stufe 2: Der Verify-Button und eine Mathe-Aufgabe sind erforderlich. Der User muss die Mathe-Aufgabe lösen, um verifiziert zu werden.';
            break;
          case 3:
            explanation = 'Stufe 3: Der Verify-Button und der Verify-Link sind erforderlich. Der User muss den Link besuchen, um einen Token zu erhalten, der dann automatisch geprüft wird.';
            break;
          case 4:
            explanation = 'Stufe 4: Der Verify-Button, der Verify-Link und eine Mathe-Aufgabe sind erforderlich. Der User muss zuerst den Link besuchen und anschließend die Mathe-Aufgabe lösen.';
            break;
          case 5:
            explanation = 'Stufe 5: Der Verify-Button, der Verify-Link, die Mathe-Aufgabe und zusätzlich eine Texteingabe der Mathe-Antwort sind erforderlich. Der User muss alle Schritte korrekt ausführen.';
            break;
          default:
            explanation = 'Unbekannter Verifizierungs-Level.';
        }
        
        if (saveConfig(config)) {
          return interaction.reply({
            content: `Verifizierungs-Level wurde auf **${level}** gesetzt.\n${explanation}`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: 'Fehler beim Speichern der Konfiguration.',
            ephemeral: true
          });
        }
      }
      
      // Rollen-Konfiguration (nach Verifizierung)
      else if (subcommand === 'role') {
        const role = interaction.options.getRole('role');
        config.role = role.id;
        
        if (saveConfig(config)) {
          return interaction.reply({
            content: `Die Rolle **${role.name}** wird jetzt nach erfolgreicher Verifizierung hinzugefügt.`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: 'Fehler beim Speichern der Konfiguration.',
            ephemeral: true
          });
        }
      }
      
      // JoinRole-Konfiguration (beim Server-Beitritt)
      else if (subcommand === 'joinrole') {
        const role = interaction.options.getRole('role');
        config.joinRole = role.id;
        
        if (saveConfig(config)) {
          return interaction.reply({
            content: `Die Rolle **${role.name}** wird jetzt automatisch bei Server-Beitritt vergeben.`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: 'Fehler beim Speichern der Konfiguration.',
            ephemeral: true
          });
        }
      }
      
      // RemoveRole-Konfiguration (nach Verifizierung entfernen)
      else if (subcommand === 'removerole') {
        const role = interaction.options.getRole('role');
        config.removeRole = role.id;
        
        if (saveConfig(config)) {
          return interaction.reply({
            content: `Die Rolle **${role.name}** wird jetzt nach erfolgreicher Verifizierung entfernt.`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: 'Fehler beim Speichern der Konfiguration.',
            ephemeral: true
          });
        }
      }
      
      // Redirect-Link Konfiguration
      else if (subcommand === 'redirect') {
        const link = interaction.options.getString('link');
        
        // Einfache Überprüfung, ob es ein Discord-Link ist
        if (!link.startsWith('https://discord.com/') && !link.includes('discord.gg')) {
          return interaction.reply({
            content: 'Bitte gib einen gültigen Discord-Link ein.',
            ephemeral: true
          });
        }
        
        config.redirectLink = link;
        
        if (saveConfig(config)) {
          return interaction.reply({
            content: `Der Redirect-Link nach Verifizierung wurde auf **${link}** gesetzt.`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: 'Fehler beim Speichern der Konfiguration.',
            ephemeral: true
          });
        }
      }
      
      // Sollte nicht vorkommen, da alle Subcommands abgedeckt sind
      else {
        return interaction.reply({
          content: 'Unbekannter Subcommand. Bitte wähle eine der verfügbaren Optionen.',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error(`Fehler in cmd_verifyconfig.js: ${error}`);
      return interaction.reply({
        content: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.',
        ephemeral: true
      });
    }
  },
};