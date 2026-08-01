class ReminderService {
    constructor() {
        this.reminders = []; // { id, jid, groupName, message, scheduledTime, timerId }
    }

    addReminder({ jid, groupName, message, targetTime, sendCallback }) {
        if (!targetTime || isNaN(targetTime.getTime())) {
            throw new Error('Format tanggal & waktu pengingat tidak valid');
        }

        const now = new Date();
        const msUntilTarget = targetTime.getTime() - now.getTime();

        if (isNaN(msUntilTarget) || msUntilTarget <= 0) {
            throw new Error('Waktu pengingat harus berada di masa depan');
        }

        const reminderId = Date.now().toString();
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

        // Return safe object without circular timerId
        return {
            id: reminderObj.id,
            jid: reminderObj.jid,
            groupName: reminderObj.groupName,
            message: reminderObj.message,
            scheduledTime: reminderObj.scheduledTime
        };
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
