const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper-Funktion zum Formatieren des Datums im Format "TT.MM.JJJJ HH:MM:SS"
function formatDate(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'unknown';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

// Pfad zur Config-Datei
const configPath = path.join(__dirname, 'verify_config.json');

// Helper-Funktion, die die Config live aus der Datei lädt (Standardwerte bei Fehler)
function getConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Fehler beim Lesen der verify_config.json:', e.message);
    return {
      port: 8084,
      role: "",
      verifyLink: "http://localhost:8084",
      verificationLevel: 4,
      joinRole: "",
      removeRole: "" // Neue Eigenschaft: Rolle die nach Verifizierung entfernt werden soll
    };
  }
}

// Globale Maps:
// 1) Aktive Challenges (UserID -> Challenge-Daten)
// 2) Spracheinstellungen (UserID -> 'en' oder 'de')
module.exports.challenges = new Map();
const userLanguagePreference = new Map();

// Verzeichnis für die Verifizierungsdaten (vom Webserver)
const dataDir = path.join(__dirname, 'verify_data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Funktion zum Hinzufügen und Entfernen von Rollen (mit verbesserter Fehlerbehandlung)
async function manageRoles(member, config) {
  try {
    // Rolle hinzufügen, wenn konfiguriert
    if (config.role && config.role.trim() !== "") {
      try {
        await member.roles.add(config.role);
        console.log(`Rolle ${config.role} wurde ${member.user.username} hinzugefügt.`);
      } catch (e) {
        console.error(`Fehler beim Hinzufügen der Rolle ${config.role}: ${e.message}`);
      }
    }
    
    // Rolle entfernen, wenn konfiguriert
    if (config.removeRole && config.removeRole.trim() !== "") {
      try {
        await member.roles.remove(config.removeRole);
        console.log(`Rolle ${config.removeRole} wurde von ${member.user.username} entfernt.`);
      } catch (e) {
        console.error(`Fehler beim Entfernen der Rolle ${config.removeRole}: ${e.message}`);
      }
    }
    
    return true;
  } catch (err) {
    console.error(`Fehler bei der Rollenverwaltung: ${err.message}`);
    return false;
  }
}

module.exports.run = async (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      // Reagiere nur auf Buttons und Modal-Submits (z.B. für Stufe 5)
      if (!interaction.isButton() && !interaction.isModalSubmit()) return;
      
      // ─────────────────────────────────────────────────────────
      // Nur auf eigene Buttons und Modals reagieren
      // ─────────────────────────────────────────────────────────
      if (interaction.isButton() && 
          !['switch_language', 'start_verify'].includes(interaction.customId) && 
          !interaction.customId.startsWith('verify_button_')) {
        return; // Ignorieren fremder Buttons
      }
      
      if (interaction.isModalSubmit() && interaction.customId !== 'math_modal') {
        return; // Ignorieren fremder Modals
      }

      const userId = interaction.user.id;

      // ─────────────────────────────────────────────────────────
      // (1) Sprache wechseln
      // ─────────────────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === 'switch_language') {
        const currentLang = userLanguagePreference.get(userId) || 'en';
        const newLang = (currentLang === 'en') ? 'de' : 'en';
        userLanguagePreference.set(userId, newLang);

        const verifyLabel = (newLang === 'de') ? '✅ Verifizieren' : '✅ Verify';
        const languageLabel = (newLang === 'de')
          ? 'Change language to English 🇺🇸'
          : 'Sprache auf Deutsch wechseln 🇩🇪';
        const infoText = (newLang === 'de')
          ? '**Du hast die Sprache auf Deutsch umgestellt.**\n\nKlicke jetzt "**✅ Verifizieren**", um dich zu verifizieren.'
          : '**You have switched to English.**\n\nClick "**✅ Verify**" to start verifying.';

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('start_verify')
              .setLabel(verifyLabel)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('switch_language')
              .setLabel(languageLabel)
              .setStyle(ButtonStyle.Secondary)
          );

        return interaction.reply({
          content: infoText,
          components: [row],
          ephemeral: true,
        });
      }

      // Vor allen weiteren Schritten immer die aktuelle Config laden
      const currentConfig = getConfig();
      const currentLevel = currentConfig.verificationLevel || 4;
      const lang = userLanguagePreference.get(userId) || 'en';
      const userFile = path.join(dataDir, `${userId}.json`);

      // Falls KEIN aktiver Challenge-Eintrag existiert, prüfen, ob der User bereits verifiziert wurde
      if (!module.exports.challenges.has(userId) && fs.existsSync(userFile)) {
        const fileContent = fs.readFileSync(userFile, 'utf8');
        let storedData;
        try {
          storedData = JSON.parse(fileContent);
        } catch (err) {
          console.error(`Error parsing ${userId}.json: ${err.message}`);
        }
        const verifiedAt = storedData?.verifiedAt ?? 'unknown';
        const displayDate = (verifiedAt === 'unknown') ? 'unknown' : formatDate(verifiedAt);
        const embed = new EmbedBuilder()
          .setColor(0x40E0D0)
          .setTitle(lang === 'de' ? 'Bereits verifiziert' : 'Already Verified')
          .setDescription(
            lang === 'de'
              ? `Du bist bereits verifiziert seit:\n**${displayDate}**\n\nViel Spaß auf dem Server!`
              : `You have already been verified since:\n**${displayDate}**\n\nHave fun on the server!`
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ─────────────────────────────────────────────────────────
      // (2) Start der Verifizierung (Button "Verify")
      // ─────────────────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === 'start_verify') {
        // Stufe 1: Nur Button → sofort verifizieren
        if (currentLevel === 1) {
          const now = new Date();
          const record = { user: userId, verifiedAt: now.toISOString() };
          fs.writeFileSync(userFile, JSON.stringify(record, null, 2), 'utf8');

          if (interaction.guild) {
            try {
              const member = await interaction.guild.members.fetch(userId);
              // Rollen verwalten mit der neuen Funktion
              await manageRoles(member, currentConfig);
            } catch (e) {
              console.error(`Error managing roles: ${e.message}`);
            }
          }
          
          const formatted = formatDate(now);
          const embed = new EmbedBuilder()
            .setColor(0x40E0D0)
            .setTitle(lang === 'de' ? 'Verifiziert' : 'Verified')
            .setDescription(
              lang === 'de'
                ? `Du bist verifiziert seit:\n**${formatted}**\n\nViel Spaß auf dem Server!`
                : `You have been verified since:\n**${formatted}**\n\nHave fun on the server!`
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        // Stufe 3: Nur Link – 180-Sekunden-Polling
        else if (currentLevel === 3) {
          const challengeId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
          module.exports.challenges.set(userId, {
            type: 'linkOnly',
            challengeId,
            language: lang,
          });
          const verificationLink = `${currentConfig.verifyLink}/verify?user=${userId}&challenge=${challengeId}&lang=${lang}`;
          const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setTitle(lang === 'de' ? 'Verifizierung (Link)' : 'Verification (Link)')
            .setDescription(
              lang === 'de'
                ? `**Besuche diesen Link, um deinen Token zu erhalten:**\n${verificationLink}\n\nDu hast 180 Sekunden Zeit, den Link zu bestätigen.`
                : `**Visit this link to receive your token:**\n${verificationLink}\n\nYou have 180 seconds to confirm via the link.`
            );
          await interaction.reply({ embeds: [embed], ephemeral: true });

          const intervalTime = 10 * 1000; // 10 Sekunden
          const totalTime = 180 * 1000; // 180 Sekunden
          let elapsed = 0;
          const checkInterval = setInterval(async () => {
            elapsed += intervalTime;
            if (fs.existsSync(userFile)) {
              clearInterval(checkInterval);
              try {
                const member = await interaction.guild.members.fetch(userId);
                // Rollen verwalten mit der neuen Funktion
                await manageRoles(member, currentConfig);
                
                await interaction.followUp({ content: lang === 'de' ? '✅ Verifizierung erfolgreich abgeschlossen!' : '✅ Verification completed successfully!', ephemeral: true });
              } catch (err) {
                console.error('Error in level 3 polling:', err.message);
              }
              module.exports.challenges.delete(userId);
            } else if (elapsed >= totalTime) {
              clearInterval(checkInterval);
              await interaction.followUp({ content: lang === 'de' ? '❌ Die Verifizierung ist abgelaufen. Bitte starte den Vorgang erneut.' : '❌ Verification expired. Please try again.', ephemeral: true });
              module.exports.challenges.delete(userId);
            }
          }, intervalTime);
          return;
        }
        // Stufen 2, 4, 5: Mathe-Challenge (ggf. mit Link)
        else {
          const a = Math.floor(Math.random() * 9) + 1;
          const b = Math.floor(Math.random() * 9) + 1;
          const correctAnswer = a + b;
          let distractor1 = correctAnswer + (Math.floor(Math.random() * 3) + 1);
          let distractor2 = correctAnswer - (Math.floor(Math.random() * 3) + 1);
          if (distractor1 === correctAnswer) distractor1 += 1;
          if (distractor2 === correctAnswer || distractor2 < 0) distractor2 = correctAnswer + 1;
          const choices = [correctAnswer, distractor1, distractor2].sort(() => Math.random() - 0.5);
          const challengeId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();
          let challengeType = 'mathOnly';
          if (currentLevel === 4) challengeType = 'linkAndMath';
          if (currentLevel === 5) challengeType = 'mathAndModal';

          module.exports.challenges.set(userId, {
            type: challengeType,
            correctAnswer,
            challengeId,
            a,
            b,
            choices,
            language: lang,
          });

          let verificationLink = '';
          if (currentLevel >= 4) {
            verificationLink = `${currentConfig.verifyLink}/verify?user=${userId}&challenge=${challengeId}&lang=${lang}`;
          }

          let embedTitle = '';
          let embedDesc = '';
          if (lang === 'de') {
            if (currentLevel === 2) {
              embedTitle = 'Verifizierung (Math-Challenge)';
              embedDesc = `**Löse die folgende Matheaufgabe:**\n**${a} + ${b} = ?**\n\nBitte wähle die richtige Antwort, indem du auf den entsprechenden Button klickst.`;
            } else {
              embedTitle = 'Verifizierung (Link & Math-Challenge)';
              embedDesc = `**Besuche diesen Link, um deine Daten zu übermitteln:**\n${verificationLink}\n\n` +
                          `***Du musst zuerst diesen Link besuchen, um einen Token zu erhalten, den du für die Verifizierung benötigst.***\n\n` +
                          `**Löse anschließend die folgende Matheaufgabe:**\n**${a} + ${b} = ?**\n\n` +
                          `Bitte wähle die richtige Antwort, indem du auf den entsprechenden Button klickst.`;
            }
          } else {
            if (currentLevel === 2) {
              embedTitle = 'Verification (Math-Challenge)';
              embedDesc = `**Solve the following math problem:**\n**${a} + ${b} = ?**\n\nPlease choose the correct answer by clicking the corresponding button.`;
            } else {
              embedTitle = 'Verification (Link & Math-Challenge)';
              embedDesc = `**Visit this link to submit your data:**\n${verificationLink}\n\n` +
                          `***You must first visit this link to receive a token that you need for verification.***\n\n` +
                          `**Then solve the following math problem:**\n**${a} + ${b} = ?**\n\n` +
                          `Please choose the correct answer by clicking the corresponding button.`;
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0x00ff99)
            .setTitle(embedTitle)
            .setDescription(embedDesc);

          const row = new ActionRowBuilder();
          for (const choice of choices) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`verify_button_${choice}`)
                .setLabel(choice.toString())
                .setStyle(ButtonStyle.Primary)
            );
          }
          return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
      }

      // ─────────────────────────────────────────────────────────
      // (3) Antwort-Button: Prüfung der Mathe-Challenge
      // ─────────────────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith('verify_button_')) {
        const userId = interaction.user.id;
        const challenge = module.exports.challenges.get(userId);
        if (!challenge) {
          return interaction.reply({ content: 'No active challenge found. Please click "Verify" again.', ephemeral: true });
        }
        const chosen = parseInt(interaction.customId.split('_')[2]);
        if (chosen !== challenge.correctAnswer) {
          const failMsg = (challenge.language === 'de')
            ? '❌ Falsche Antwort. Bitte versuche es erneut.'
            : '❌ Incorrect answer. Please try again.';
          return interaction.reply({ content: failMsg, ephemeral: true });
        }

        // Falls Stufe 5: zusätzlich Modal zur Texteingabe
        if (challenge.type === 'mathAndModal') {
          const modalTitle = (challenge.language === 'de')
            ? 'Mathe-Aufgabe bestätigen'
            : 'Confirm Math Answer';
          const modal = new ModalBuilder()
            .setCustomId('math_modal')
            .setTitle(modalTitle);
          const inputLabel = (challenge.language === 'de')
            ? 'Gib die Antwort als Zahl ein'
            : 'Enter the answer as a number';
          const mathInput = new TextInputBuilder()
            .setCustomId('math_answer')
            .setLabel(inputLabel)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(chosen.toString()); // Vorausfüllen mit der gewählten Antwort
          const modalRow = new ActionRowBuilder().addComponents(mathInput);
          modal.addComponents(modalRow);
          return interaction.showModal(modal);
        }
        // Falls Stufe 2: Direkt verifizieren (ohne Token-Prüfung)
        else if (challenge.type === 'mathOnly') {
          const now = new Date();
          const record = { user: userId, verifiedAt: now.toISOString() };
          fs.writeFileSync(path.join(dataDir, `${userId}.json`), JSON.stringify(record, null, 2), 'utf8');

          try {
            const member = await interaction.guild.members.fetch(userId);
            // Rollen verwalten mit der neuen Funktion
            await manageRoles(member, getConfig());
            
            module.exports.challenges.delete(userId);
            const successMsg = (challenge.language === 'de')
              ? '✅ Verifizierung erfolgreich! Du bist nun verifiziert, viel Spaß auf dem Server!'
              : '✅ Verification successful! You are verified, have fun on the server!';
            return interaction.reply({ content: successMsg, ephemeral: true });
          } catch (err) {
            console.error(`Error in level 2 verification:`, err.message);
            const failMsg = (challenge.language === 'de')
              ? '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.'
              : '❌ An error occurred. Please try again.';
            return interaction.reply({ content: failMsg, ephemeral: true });
          }
        }
        // Falls Stufe 4: Token-Prüfung
        else if (challenge.type === 'linkAndMath') {
          const filePath = path.join(dataDir, `${userId}.json`);
          if (!fs.existsSync(filePath)) {
            const msg = (challenge.language === 'de')
              ? 'Verifizierung fehlgeschlagen: Es wurde kein Token generiert. Bitte besuche den Verifizierungslink und akzeptiere die Regeln.'
              : 'Verification failed: No token was generated. Please visit the verification link and accept the rules.';
            return interaction.reply({ content: msg, ephemeral: true });
          }
          
          try {
            // Token-Datei existiert bereits, Rolle zuweisen
            const member = await interaction.guild.members.fetch(userId);
            // Rollen verwalten mit der neuen Funktion
            await manageRoles(member, getConfig());
            
            module.exports.challenges.delete(userId);
            const successMsg = (challenge.language === 'de')
              ? '✅ Verifizierung erfolgreich! Du bist nun verifiziert, viel Spaß auf dem Server!'
              : '✅ Verification successful! You are verified, have fun on the server!';
            return interaction.reply({ content: successMsg, ephemeral: true });
          } catch (err) {
            console.error(`Error in level 4 verification:`, err.message);
            const failMsg = (challenge.language === 'de')
              ? '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.'
              : '❌ An error occurred. Please try again.';
            return interaction.reply({ content: failMsg, ephemeral: true });
          }
        }
        else {
          return interaction.reply({ content: 'Unexpected scenario. Please try again.', ephemeral: true });
        }
      }

      // ─────────────────────────────────────────────────────────
      // (4) Modal-Submit: Zusätzliche Texteingabe (Stufe 5)
      // ─────────────────────────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId === 'math_modal') {
        const userId = interaction.user.id;
        const challenge = module.exports.challenges.get(userId);
        if (!challenge) {
          return interaction.reply({ content: 'No active challenge found. Please try again.', ephemeral: true });
        }
        
        const userAnswer = interaction.fields.getTextInputValue('math_answer');
        // Prüfe, ob der eingegebene Wert eine Zahl und korrekt ist
        const parsedAnswer = parseInt(userAnswer.trim());
        
        if (isNaN(parsedAnswer) || parsedAnswer !== challenge.correctAnswer) {
          const failMsg = (challenge.language === 'de')
            ? '❌ Falsche Eingabe. Bitte versuche es erneut.'
            : '❌ Incorrect input. Please try again.';
          return interaction.reply({ content: failMsg, ephemeral: true });
        }
        
        // Prüfen, ob die Token-Datei bereits existiert
        const filePath = path.join(dataDir, `${userId}.json`);
        if (!fs.existsSync(filePath)) {
          // Wenn die Datei nicht existiert, erstelle einen temporären Token
          // Bei Level 5 muss der User zuerst den Link besuchen
          const msg = (challenge.language === 'de')
            ? 'Verifizierung fehlgeschlagen: Es wurde kein Token generiert. Bitte besuche den Verifizierungslink und akzeptiere die Regeln.'
            : 'Verification failed: No token was generated. Please visit the verification link and accept the rules.';
          return interaction.reply({ content: msg, ephemeral: true });
        }
        
        try {
          // Alles okay, Rollen verwalten
          const member = await interaction.guild.members.fetch(userId);
          // Rollen verwalten mit der neuen Funktion
          await manageRoles(member, getConfig());
          
          module.exports.challenges.delete(userId);
          const successMsg = (challenge.language === 'de')
            ? '✅ Verifizierung erfolgreich! Du bist nun verifiziert, viel Spaß auf dem Server!'
            : '✅ Verification successful! You are verified, have fun on the server!';
          return interaction.reply({ content: successMsg, ephemeral: true });
        } catch (err) {
          console.error(`Error in level 5 verification:`, err.message);
          const failMsg = (challenge.language === 'de')
            ? '❌ Ein Fehler ist aufgetreten. Bitte versuche es erneut.'
            : '❌ An error occurred. Please try again.';
          return interaction.reply({ content: failMsg, ephemeral: true });
        }
      }

    } catch (err) {
      console.error(`Error in verify.js: ${err.message}`);
      if (!interaction.replied) {
        await interaction.reply({
          content: 'An unexpected error occurred. Please try again later.',
          ephemeral: true,
        });
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  // (5) Automatische Rolle bei Server-Beitritt
  // ─────────────────────────────────────────────────────────
  client.on('guildMemberAdd', async member => {
    try {
      const currentConfig = getConfig();
      if (!currentConfig.joinRole || currentConfig.joinRole.trim() === '') return; // Keine joinRole gesetzt
      // Rolle vergeben
      await member.roles.add(currentConfig.joinRole);
      console.log(`Automatisch die joinRole "${currentConfig.joinRole}" an ${member.user.username} vergeben.`);
    } catch (err) {
      console.error('Fehler beim Zuweisen der joinRole:', err.message);
    }
  });

  // ─────────────────────────────────────────────────────────
  // (6) Automatisches Löschen der Verifizierungsdaten, wenn ein User den Server verlässt
  // ─────────────────────────────────────────────────────────
  client.on('guildMemberRemove', async member => {
    const userId = member.id;
    const filePath = path.join(dataDir, `${userId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Verifizierungsdaten von ${member.user.username} wurden gelöscht (Server verlassen).`);
    }
  });
};