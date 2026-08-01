class ReminderService {
    constructor() {
        this.reminders = []; // { id, jid, groupName, message, scheduledTime, timerId }
    }

    addReminder({ jid, groupName, message, targetTime, sendCallback }) {
        const reminderId = Date.now().toString();
        const now = new Date();
        const msUntilTarget = targetTime.getTime() - now.getTime();

        if (msUntilTarget <= 0) {
            throw new Error('Waktu pengingat harus di masa depan');
        }

        const timerId = setTimeout(async () => {
            try {
                await sendCallback(jid, `⏰ *PENGINGAT / REMINDER*\n\n${message}`);
            } catch (err) {
                console.error('Gagal mengirim pengingat:', err);
            }
            this.removeReminder(reminderId);
        }, msUntilTarget);

        const reminderObj = {
            id: reminderId,
            jid,
            groupName: groupName || jid,
            message,
            scheduledTime: targetTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            timerId
        };

        this.reminders.push(reminderObj);
        return reminderObj;
    }

    getReminders() {
        return this.reminders.map(({ id, jid, groupName, message, scheduledTime }) => ({
            id, jid, groupName, message, scheduledTime
        }));
    }

    removeReminder(id) {
        const index = this.reminders.findIndex(r => r.id === id);
        if (index !== -1) {
            clearTimeout(this.reminders[index].timerId);
            this.reminders.splice(index, 1);
            return true;
        }
        return false;
    }
}

module.exports = new ReminderService();
