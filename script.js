// Lista obecnosci - JavaScript
class AttendanceManager {
    constructor() {
        // Predefiniowane grupy
        this.groups = [
            'NAUKA 1 PON/ŚR 15:45',
            'NAUKA 2 PON/ŚR 15:45', 
            'NAUKA 3 PON/ŚR 19:00',
            'NAUKA 4 WT/CZW 15:45',
            'DOSKONALĄCY ŚREDNI PN/ŚR 17:15',
            'DOSKONALĄCY STARSI WT/CZW 19:00',
            'KONTYNUACJA NAUKI 1 PN/ŚR 16:30',
            'KONTYNUACJA NAUKI 2 WT/CZW 16:30',
            'DOSKONALĄCY MŁODSI 2 WT/CZW 18:00',
            'DOSKONALĄCY MŁODSI 1 WT/CZW 17:15'
        ];
        
        this.selectedGroup = null;
        this.people = [];
        this.dates = [];
        this.attendanceData = {}; // Dane obecności dla każdej daty w aktualnej grupie
        this.groupData = {}; // Dane dla każdej grupy - będą ładowane z Supabase
        this.currentFilter = 'all';
        this.selectedDate = null;
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadFromSupabase();
        this.setupPolling(); // Używamy polling zamiast Realtime
        this.renderGroups();
        this.render();
        this.renderDates();
        this.updateStats();
        this.updateClearDateButton();
    }

    bindEvents() {
        document.getElementById('addBtn').addEventListener('click', () => this.addPerson());
        document.getElementById('personName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPerson();
        });
        document.getElementById('personAge').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPerson();
        });
        document.getElementById('personPhone').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPerson();
        });
        document.getElementById('showAll').addEventListener('click', () => this.setFilter('all'));
        document.getElementById('showPresent').addEventListener('click', () => this.setFilter('present'));
        document.getElementById('showAbsent').addEventListener('click', () => this.setFilter('absent'));
        document.getElementById('markAllPresent').addEventListener('click', () => this.markAllPresent());
        document.getElementById('markAllAbsent').addEventListener('click', () => this.markAllAbsent());
        document.getElementById('deleteAllPeople').addEventListener('click', () => this.deleteAllPeople());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportList());
        
        // Obsługa kalendarza
        document.getElementById('addDateBtn').addEventListener('click', () => this.showAddDateModal());
        document.getElementById('clearDateBtn').addEventListener('click', () => this.clearSelectedDate());
    }

    addPerson() {
        if (!this.selectedGroup) {
            this.showNotification('Wybierz grupę przed dodaniem osoby!', 'error');
            return;
        }

        const nameInput = document.getElementById('personName');
        const ageInput = document.getElementById('personAge');
        const phoneInput = document.getElementById('personPhone');
        
        const name = nameInput.value.trim();
        const ageValue = ageInput.value.trim();
        const phone = phoneInput.value.trim();

        if (!name) {
            this.showNotification('Wprowadź imię i nazwisko!', 'error');
            return;
        }

        // Wiek jest opcjonalny - sprawdź tylko jeśli został wprowadzony
        let age = null;
        if (ageValue) {
            age = parseInt(ageValue);
            if (isNaN(age) || age < 1 || age > 120) {
                this.showNotification('Wprowadź prawidłowy wiek (1-120 lat) lub zostaw puste!', 'error');
                return;
            }
        }

        if (this.people.some(person => person.name.toLowerCase() === name.toLowerCase())) {
            this.showNotification('Osoba o tym imieniu już istnieje!', 'error');
            return;
        }

        const newPerson = {
            id: Date.now(),
            name: name,
            age: age,
            phone: phone || '',
            present: false,
            addedAt: new Date().toISOString()
        };

        this.people.push(newPerson);
        this.saveGroupData();
        this.render();
        this.updateStats();
        
        nameInput.value = '';
        ageInput.value = '';
        phoneInput.value = '';
        
        // Przejdź z powrotem do pierwszego pola
        nameInput.focus();
        
        this.showNotification(name + ' został(a) dodany(a) do listy!', 'success');
    }
    toggleAttendance(id) {
        // Toggle obecności działa tylko gdy jest wybrana data
        if (this.selectedDate && this.currentDateAttendance) {
            const person = this.currentDateAttendance.find(p => p.id === id);
        if (person) {
            person.present = !person.present;
                this.saveAttendanceForCurrentDate();
            this.render();
            this.updateStats();
            
            const status = person.present ? 'obecny(a)' : 'nieobecny(a)';
            this.showNotification(person.name + ' oznaczony(a) jako ' + status, 'info');
            }
        } else {
            this.showNotification('Wybierz datę aby zaznaczyć obecność!', 'error');
        }
    }

    editPerson(id) {
        const person = this.people.find(p => p.id === id);
        if (!person) return;

        // Pokaż modal edycji
        this.showEditModal(person);
    }

    showEditModal(person) {
        // Utwórz modal edycji
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edytuj osobę</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="editName">Imię i nazwisko:</label>
                        <input type="text" id="editName" value="${this.escapeHtml(person.name)}" maxlength="50" required>
                    </div>
                    <div class="form-group">
                        <label for="editAge">Wiek:</label>
                        <input type="number" id="editAge" value="${person.age || ''}" min="1" max="120">
                    </div>
                    <div class="form-group">
                        <label for="editPhone">Numer telefonu:</label>
                        <input type="tel" id="editPhone" value="${this.escapeHtml(person.phone || '')}" maxlength="15">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Anuluj</button>
                    <button class="btn btn-primary" onclick="attendanceManager.saveEdit(${person.id})">Zapisz</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // Fokus na pierwszym polu
        setTimeout(() => {
            document.getElementById('editName').focus();
        }, 100);
    }

    saveEdit(id) {
        const nameInput = document.getElementById('editName');
        const ageInput = document.getElementById('editAge');
        const phoneInput = document.getElementById('editPhone');
        
        const name = nameInput.value.trim();
        const ageValue = ageInput.value.trim();
        const phone = phoneInput.value.trim();

        if (!name) {
            this.showNotification('Wprowadź imię i nazwisko!', 'error');
            return;
        }

        // Wiek jest opcjonalny - sprawdź tylko jeśli został wprowadzony
        let age = null;
        if (ageValue) {
            age = parseInt(ageValue);
            if (isNaN(age) || age < 1 || age > 120) {
                this.showNotification('Wprowadź prawidłowy wiek (1-120 lat) lub zostaw puste!', 'error');
                return;
            }
        }

        // Sprawdź czy nazwa nie jest już używana przez inną osobę
        const existingPerson = this.people.find(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase());
        if (existingPerson) {
            this.showNotification('Osoba o tym imieniu już istnieje!', 'error');
            return;
        }

        // Znajdź i zaktualizuj osobę
        const person = this.people.find(p => p.id === id);
        if (person) {
            person.name = name;
            person.age = age;
            person.phone = phone || '';
            
            this.saveGroupData();
            this.render();
            this.updateStats();
            
            // Zamknij modal
            document.querySelector('.modal-overlay').remove();
            
            this.showNotification(name + ' został(a) zaktualizowany(a)!', 'success');
        }
    }

    deletePerson(id) {
        const person = this.people.find(p => p.id === id);
        if (person && confirm('Czy na pewno chcesz usunac ' + person.name + ' z listy?')) {
            this.people = this.people.filter(p => p.id !== id);
            this.saveGroupData();
            this.render();
            this.updateStats();
            this.showNotification(person.name + ' zostal(a) usuniety(a) z listy', 'info');
        }
    }

    deleteAllPeople() {
        if (!this.selectedGroup) {
            this.showNotification('Wybierz grupę!', 'error');
            return;
        }

        if (this.people.length === 0) {
            this.showNotification('Lista jest pusta!', 'error');
            return;
        }

        const groupName = this.selectedGroup;
        const peopleCount = this.people.length;
        
        if (confirm(`Czy na pewno chcesz usunąć wszystkich (${peopleCount} osób) z grupy "${groupName}"? Ta operacja jest nieodwracalna!`)) {
            this.people = [];
            this.dates = [];
            this.attendanceData = {};
            this.selectedDate = null;
            this.currentDateAttendance = null;
            
            this.saveGroupData();
            this.render();
            this.renderDates();
            this.updateStats();
            this.updateClearDateButton();
            
            this.showNotification(`Usunięto wszystkich (${peopleCount} osób) z grupy "${groupName}"`, 'info');
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('show' + filter.charAt(0).toUpperCase() + filter.slice(1)).classList.add('active');
        this.render();
    }

    markAllPresent() {
        if (!this.selectedDate || !this.currentDateAttendance) {
            this.showNotification('Wybierz datę aby zaznaczyć obecność!', 'error');
            return;
        }
        
        if (this.currentDateAttendance.length === 0) {
            this.showNotification('Lista jest pusta!', 'error');
            return;
        }
        
        this.currentDateAttendance.forEach(person => person.present = true);
        this.saveAttendanceForCurrentDate();
        this.render();
        this.updateStats();
        this.showNotification('Wszyscy oznaczono jako obecni!', 'success');
    }

    markAllAbsent() {
        if (!this.selectedDate || !this.currentDateAttendance) {
            this.showNotification('Wybierz datę aby zaznaczyć obecność!', 'error');
            return;
        }
        
        if (this.currentDateAttendance.length === 0) {
            this.showNotification('Lista jest pusta!', 'error');
            return;
        }
        
        this.currentDateAttendance.forEach(person => person.present = false);
        this.saveAttendanceForCurrentDate();
        this.render();
        this.updateStats();
        this.showNotification('Wszyscy oznaczono jako nieobecni!', 'success');
    }
    getFilteredPeople(peopleList = null) {
        const people = peopleList || this.people;
        let filtered;
        switch (this.currentFilter) {
            case 'present':
                filtered = people.filter(person => person.present);
                break;
            case 'absent':
                filtered = people.filter(person => !person.present);
                break;
            default:
                filtered = people;
        }
        
        // Sortuj alfabetycznie po nazwisku (ostatnie słowo)
        return filtered.sort((a, b) => {
            const getLastName = (name) => {
                const parts = name.trim().split(' ');
                return parts[parts.length - 1].toLowerCase();
            };
            return getLastName(a.name).localeCompare(getLastName(b.name), 'pl');
        });
    }

    render() {
        const container = document.getElementById('attendanceList');
        
        // Użyj danych z wybranej daty jeśli jest wybrana, w przeciwnym razie użyj oryginalnej listy
        const peopleToRender = this.selectedDate && this.currentDateAttendance ? this.currentDateAttendance : this.people;
        const filteredPeople = this.getFilteredPeople(peopleToRender);

        if (filteredPeople.length === 0) {
            const emptyMessage = peopleToRender.length === 0 
                ? 'Brak osob na liscie. Dodaj pierwsza osobe!'
                : 'Brak osob w kategorii ' + this.getFilterLabel();
            
            container.innerHTML = '<div class="empty-state"><p>' + emptyMessage + '</p></div>';
            return;
        }

        // Jeśli jest wybrana data, pokaż pełny interfejs z zaznaczaniem obecności
        if (this.selectedDate && this.currentDateAttendance) {
        container.innerHTML = filteredPeople.map(person => {
            return '<div class="person-item ' + (person.present ? 'present' : 'absent') + '">' +
                '<div class="person-info">' +
                    '<span class="person-name">' + this.escapeHtml(person.name) + '</span>' +
                    '<div class="person-details">' +
                        (person.age && person.age !== null ? '<span class="person-age">👤 ' + person.age + ' lat</span>' : '') +
                        (person.phone && person.phone !== '' ? '<span class="person-phone">📞 ' + this.escapeHtml(person.phone) + '</span>' : '') +
                    '</div>' +
                    '<span class="status-badge ' + (person.present ? 'present' : 'absent') + '">' +
                        (person.present ? 'Obecny' : 'Nieobecny') +
                    '</span>' +
                '</div>' +
                '<div class="person-actions">' +
                    '<button class="toggle-btn ' + (person.present ? 'toggle-absent' : 'toggle-present') + '" ' +
                            'onclick="attendanceManager.toggleAttendance(' + person.id + ')">' +
                        (person.present ? 'Oznacz jako nieobecny' : 'Oznacz jako obecny') +
                    '</button>' +
                    '<button class="edit-btn" onclick="attendanceManager.editPerson(' + person.id + ')">' +
                        'Edytuj' +
                    '</button>' +
                    '<button class="delete-btn" onclick="attendanceManager.deletePerson(' + person.id + ')">' +
                        'Usun' +
                    '</button>' +
                '</div>' +
            '</div>';
        }).join('');
        } else {
            // Jeśli nie ma wybranej daty, pokaż tylko listę osób bez możliwości zaznaczania obecności
            container.innerHTML = filteredPeople.map(person => {
                return '<div class="person-item general-list">' +
                    '<div class="person-info">' +
                        '<span class="person-name">' + this.escapeHtml(person.name) + '</span>' +
                        '<div class="person-details">' +
                            (person.age && person.age !== null ? '<span class="person-age">👤 ' + person.age + ' lat</span>' : '') +
                            (person.phone && person.phone !== '' ? '<span class="person-phone">📞 ' + this.escapeHtml(person.phone) + '</span>' : '') +
                        '</div>' +
                        '<span class="info-text">Wybierz datę aby zaznaczyć obecność</span>' +
                    '</div>' +
                    '<div class="person-actions">' +
                        '<button class="edit-btn" onclick="attendanceManager.editPerson(' + person.id + ')">' +
                            'Edytuj' +
                        '</button>' +
                        '<button class="delete-btn" onclick="attendanceManager.deletePerson(' + person.id + ')">' +
                            'Usun' +
                        '</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
    }
    updateStats() {
        if (this.selectedDate && this.currentDateAttendance) {
            // Jeśli jest wybrana data, pokaż statystyki dla tej daty
            const total = this.currentDateAttendance.length;
            const present = this.currentDateAttendance.filter(p => p.present).length;
        const absent = total - present;

        document.getElementById('totalCount').textContent = total;
        document.getElementById('presentCount').textContent = present;
        document.getElementById('absentCount').textContent = absent;
        } else {
            // Jeśli nie ma wybranej daty, pokaż tylko liczbę osób w grupie
            const total = this.people.length;
            document.getElementById('totalCount').textContent = total;
            document.getElementById('presentCount').textContent = '-';
            document.getElementById('absentCount').textContent = '-';
        }
    }

    getFilterLabel() {
        switch (this.currentFilter) {
            case 'present': return 'Obecni';
            case 'absent': return 'Nieobecni';
            default: return 'Wszyscy';
        }
    }

    exportList() {
        const peopleToExport = this.selectedDate && this.currentDateAttendance ? this.currentDateAttendance : this.people;
        
        if (peopleToExport.length === 0) {
            this.showNotification('Lista jest pusta!', 'error');
            return;
        }

        const currentDate = new Date().toLocaleDateString('pl-PL');
        const time = new Date().toLocaleTimeString('pl-PL');
        
        // Jeśli jest wybrana data, użyj jej w nazwie pliku i nagłówku
        let exportDate = currentDate;
        let fileName = 'lista-obecnosci-' + currentDate.replace(/\./g, '-');
        
        if (this.selectedDate) {
            const selectedDateObj = this.dates.find(d => d.id === this.selectedDate);
            if (selectedDateObj) {
                exportDate = selectedDateObj.displayDate;
                fileName = 'lista-obecnosci-' + selectedDateObj.date;
            }
        }
        
        let csvContent = 'Lista Obecnosci - ' + exportDate + ' ' + time + '\n\n';
        csvContent += 'Imie,Wiek,Telefon,Status,Data dodania\n';
        
        peopleToExport.forEach(person => {
            const status = person.present ? 'Obecny' : 'Nieobecny';
            const addedDate = new Date(person.addedAt).toLocaleDateString('pl-PL');
            const age = (person.age && person.age !== null) ? person.age : 'Brak danych';
            const phone = (person.phone && person.phone !== '') ? person.phone : 'Brak danych';
            csvContent += '"' + person.name + '","' + age + '","' + phone + '","' + status + '","' + addedDate + '"\n';
        });

        const present = peopleToExport.filter(p => p.present).length;
        const absent = peopleToExport.length - present;
        csvContent += '\nStatystyki:\n';
        csvContent += 'Wszystkich: ' + peopleToExport.length + '\n';
        csvContent += 'Obecnych: ' + present + '\n';
        csvContent += 'Nieobecnych: ' + absent + '\n';
        csvContent += 'Procent obecnosci: ' + (peopleToExport.length > 0 ? ((present / peopleToExport.length) * 100).toFixed(1) : 0) + '%';

        this.downloadCSV(csvContent, fileName + '.csv');
        this.showNotification('Lista zostala wyeksportowana!', 'success');
    }
    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // Metody Supabase
    async saveToSupabase() {
        if (this.selectedGroup) {
            try {
                console.log('Próba zapisania do Supabase:', {
                    group: this.selectedGroup,
                    people: this.people,
                    dates: this.dates,
                    attendanceData: this.attendanceData
                });
                
                // Zawsze usuń stary rekord i dodaj nowy
                await supabase
                    .from('groups')
                    .delete()
                    .eq('group_name', this.selectedGroup);
                
                // Dodaj nowy rekord
                const result = await supabase
                    .from('groups')
                    .insert({
                        group_name: this.selectedGroup,
                        people: this.people,
                        dates: this.dates,
                        attendance_data: this.attendanceData,
                        updated_at: new Date().toISOString()
                    });
                
                if (result.error) {
                    console.error('Błąd Supabase:', result.error);
                    throw result.error;
                }
                
                console.log('Sukces! Zapisano do Supabase:', result.data);
                this.showNotification('Dane zapisane do bazy!', 'success');
            } catch (error) {
                console.error('Błąd zapisywania do Supabase:', error);
                this.showNotification('Błąd zapisywania danych: ' + error.message, 'error');
            }
        } else {
            console.log('Brak wybranej grupy - nie zapisuję do Supabase');
        }
    }

    async loadFromSupabase() {
        try {
            const { data, error } = await supabase
                .from('groups')
                .select('*');
            
            if (error) throw error;
            
            // Konwertuj dane z Supabase do formatu groupData
            this.groupData = {};
            if (data) {
                data.forEach(row => {
                    this.groupData[row.group_name] = {
                        people: row.people || [],
                        dates: row.dates || [],
                        attendanceData: row.attendance_data || {}
                    };
                });
            }
            
            console.log('Załadowano z Supabase:', this.groupData);
        } catch (error) {
            console.error('Błąd ładowania z Supabase:', error);
            this.showNotification('Błąd ładowania danych!', 'error');
        }
    }

    setupPolling() {
        // Odświeżaj dane co 3 sekundy
        setInterval(async () => {
            try {
                const { data, error } = await supabase
                    .from('groups')
                    .select('*')
                    .order('updated_at', { ascending: false });
                
                if (error) throw error;
                
                if (data) {
                    let hasChanges = false;
                    const newGroupData = {};
                    
                    data.forEach(row => {
                        const groupName = row.group_name;
                        const newData = {
                            people: row.people || [],
                            dates: row.dates || [],
                            attendanceData: row.attendance_data || {}
                        };
                        
                        // Sprawdź czy dane się zmieniły
                        if (JSON.stringify(this.groupData[groupName]) !== JSON.stringify(newData)) {
                            hasChanges = true;
                        }
                        
                        newGroupData[groupName] = newData;
                    });
                    
                    if (hasChanges) {
                        this.groupData = newGroupData;
                        
                        // Jeśli aktualna grupa się zmieniła, odśwież widok
                        if (this.selectedGroup) {
                            this.loadGroupData(this.selectedGroup);
                        }
                        
                        console.log('Dane zostały zaktualizowane przez polling');
                    }
                }
            } catch (error) {
                console.error('Błąd polling:', error);
            }
        }, 3000); // Co 3 sekundy
    }

    saveToStorage() {
        // Zachowaj localStorage jako backup
        localStorage.setItem('groupData', JSON.stringify(this.groupData));
        // Głównie używaj Supabase
        this.saveToSupabase();
    }

    // Metody grup
    renderGroups() {
        const container = document.getElementById('groupsList');
        container.innerHTML = this.groups.map(group => {
            const isSelected = this.selectedGroup === group;
            return `
                <div class="group-item ${isSelected ? 'selected' : ''}" onclick="attendanceManager.selectGroup('${group}')">
                    ${this.escapeHtml(group)}
                </div>
            `;
        }).join('');
    }

    selectGroup(groupName) {
        this.selectedGroup = groupName;
        this.renderGroups();
        
        // Załaduj dane dla wybranej grupy
        this.loadGroupData(groupName);
        
        // Wyczyść wybór daty
        this.selectedDate = null;
        this.currentDateAttendance = null;
        this.renderDates();
        this.updateClearDateButton();
        
        this.showNotification('Wybrano grupę: ' + groupName, 'info');
    }

    loadGroupData(groupName) {
        // Jeśli nie ma danych dla tej grupy, utwórz nowe
        if (!this.groupData[groupName]) {
            this.groupData[groupName] = {
                people: [],
                dates: [],
                attendanceData: {}
            };
            this.saveToStorage();
        }

        // Załaduj dane grupy
        const groupData = this.groupData[groupName];
        this.people = groupData.people || [];
        this.dates = groupData.dates || [];
        this.attendanceData = groupData.attendanceData || {};
        
        this.render();
        this.updateStats();
    }

    saveGroupData() {
        if (this.selectedGroup) {
            this.groupData[this.selectedGroup] = {
                people: this.people,
                dates: this.dates,
                attendanceData: this.attendanceData
            };
            this.saveToStorage();
            console.log('Zapisano dane grupy:', this.selectedGroup, this.groupData[this.selectedGroup]);
        }
    }

    // Metody kalendarza
    showAddDateModal() {
        if (!this.selectedGroup) {
            this.showNotification('Wybierz grupę przed dodaniem daty!', 'error');
            return;
        }

        const date = prompt('Wprowadź datę (format: YYYY-MM-DD):');
        if (date && this.isValidDate(date)) {
            this.addDate(date);
        } else if (date) {
            this.showNotification('Nieprawidłowy format daty! Użyj YYYY-MM-DD', 'error');
        }
    }

    isValidDate(dateString) {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateString)) return false;
        
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date) && dateString === date.toISOString().split('T')[0];
    }

    addDate(dateString) {
        if (this.dates.some(date => date.date === dateString)) {
            this.showNotification('Ta data już istnieje!', 'error');
            return;
        }

        const newDate = {
            id: Date.now(),
            date: dateString,
            displayDate: this.formatDateForDisplay(dateString),
            createdAt: new Date().toISOString()
        };

        this.dates.push(newDate);
        this.dates.sort((a, b) => new Date(a.date) - new Date(b.date));
        this.saveGroupData();
        this.renderDates();
        this.showNotification('Data została dodana!', 'success');
    }

    formatDateForDisplay(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    }

    deleteDate(id) {
        const date = this.dates.find(d => d.id === id);
        if (date && confirm('Czy na pewno chcesz usunąć tę datę?')) {
            this.dates = this.dates.filter(d => d.id !== id);
            if (this.selectedDate === id) {
                this.selectedDate = null;
            }
            this.saveGroupData();
            this.renderDates();
            this.showNotification('Data została usunięta!', 'info');
        }
    }

    selectDate(id) {
        this.selectedDate = id;
        this.renderDates();
        this.loadAttendanceForDate(id);
        this.updateClearDateButton();
        this.showNotification('Wybrano datę: ' + this.dates.find(d => d.id === id).displayDate, 'info');
    }

    clearSelectedDate() {
        this.selectedDate = null;
        this.currentDateAttendance = null;
        this.renderDates();
        this.restoreOriginalPeople();
        this.render();
        this.updateStats();
        this.updateClearDateButton();
        this.showNotification('Odznaczono datę - wyświetlana jest ogólna lista', 'info');
    }

    updateClearDateButton() {
        const clearBtn = document.getElementById('clearDateBtn');
        if (this.selectedDate) {
            clearBtn.style.display = 'block';
        } else {
            clearBtn.style.display = 'none';
        }
    }

    // Ładowanie danych obecności dla wybranej daty
    loadAttendanceForDate(dateId) {
        const date = this.dates.find(d => d.id === dateId);
        if (!date) return;

        // Sprawdź czy dane już istnieją w localStorage dla tej grupy i daty
        const groupData = this.groupData[this.selectedGroup];
        if (!groupData.attendanceData[date.date]) {
            // Jeśli nie ma danych dla tej daty, utwórz nowe na podstawie aktualnej listy osób
            groupData.attendanceData[date.date] = this.people.map(person => ({
                id: person.id,
                name: person.name,
                age: person.age,
                phone: person.phone || '',
                present: false,
                addedAt: person.addedAt
            }));
            this.saveGroupData();
        } else {
            // Jeśli dane już istnieją, zaktualizuj listę osób (dodaj nowe osoby jeśli zostały dodane)
            const existingData = groupData.attendanceData[date.date];
            const newPeople = this.people.filter(person => 
                !existingData.some(existing => existing.id === person.id)
            );
            
            if (newPeople.length > 0) {
                // Dodaj nowe osoby do istniejących danych
                newPeople.forEach(person => {
                    existingData.push({
                        id: person.id,
                        name: person.name,
                        age: person.age,
                        phone: person.phone || '',
                        present: false,
                        addedAt: person.addedAt
                    });
                });
                this.saveGroupData();
            }
            
            // Usuń osoby które zostały usunięte z grupy
            groupData.attendanceData[date.date] = existingData.filter(existing => 
                this.people.some(person => person.id === existing.id)
            );
            this.saveGroupData();
        }

        // Załaduj dane z localStorage do aktualnej sesji
        this.attendanceData = groupData.attendanceData;
        this.currentDateAttendance = this.attendanceData[date.date];
        console.log('Załadowano dane dla daty:', date.date, this.currentDateAttendance);
        this.render();
        this.updateStats();
    }

    // Zapisywanie danych obecności dla aktualnej daty
    saveAttendanceForCurrentDate() {
        if (this.selectedDate && this.currentDateAttendance && this.selectedGroup) {
            const date = this.dates.find(d => d.id === this.selectedDate);
            if (date) {
                // Zapisz dane obecności bezpośrednio w strukturze grupy
                this.groupData[this.selectedGroup].attendanceData[date.date] = this.currentDateAttendance.map(person => ({
                    id: person.id,
                    name: person.name,
                    age: person.age,
                    phone: person.phone || '',
                    present: person.present,
                    addedAt: person.addedAt
                }));
                this.saveGroupData();
            }
        }
    }

    // Przywracanie oryginalnej listy osób (bez danych obecności)
    restoreOriginalPeople() {
        if (this.selectedGroup && this.groupData[this.selectedGroup]) {
            this.people = this.groupData[this.selectedGroup].people || [];
        } else {
            this.people = [];
        }
    }

    renderDates() {
        const container = document.getElementById('dateList');
        
        if (this.dates.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Brak zapisanych dat</p></div>';
            return;
        }

        container.innerHTML = this.dates.map(date => {
            const isSelected = this.selectedDate === date.id;
            return `
                <div class="date-item ${isSelected ? 'selected' : ''}" onclick="attendanceManager.selectDate(${date.id})">
                    <div class="date-info">
                        <span class="date-text">${this.escapeHtml(date.displayDate)}</span>
                        <div class="date-actions">
                            <button class="date-delete-btn" onclick="event.stopPropagation(); attendanceManager.deleteDate(${date.id})">
                                ×
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = 'notification notification-' + type;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            zIndex: '1000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });

        const colors = {
            success: '#28a745',
            error: '#dc3545',
            info: '#17a2b8',
            warning: '#ffc107'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}
// System logowania
class LoginManager {
    constructor() {
        this.correctUsername = 'planprzygoda';
        this.correctPassword = 'przygod2025';
        this.init();
    }

    init() {
        // Sprawdź czy użytkownik jest już zalogowany
        if (this.isLoggedIn()) {
            this.showMainApp();
            return;
        }

        // Pokaż stronę logowania
        this.showLoginPage();
        this.bindLoginEvents();
    }

    bindLoginEvents() {
        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        if (username === this.correctUsername && password === this.correctPassword) {
            // Zaloguj użytkownika
            this.login();
            this.showMainApp();
        } else {
            // Pokaż błąd
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Nieprawidłowy login lub hasło!';
        }
    }

    login() {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginTime', Date.now().toString());
    }

    isLoggedIn() {
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        const loginTime = parseInt(localStorage.getItem('loginTime') || '0');
        const now = Date.now();
        
        // Sesja wygasa po 24 godzinach
        const sessionExpired = (now - loginTime) > (24 * 60 * 60 * 1000);
        
        if (sessionExpired) {
            this.logout();
            return false;
        }
        
        return isLoggedIn;
    }

    logout() {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        this.showLoginPage();
    }

    showLoginPage() {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }

    showMainApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        
        // Inicjalizuj główną aplikację
        if (typeof AttendanceManager !== 'undefined') {
            window.attendanceManager = new AttendanceManager();
        }
        
        // Dodaj obsługę przycisku wylogowania
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }
}

// Inicjalizacja aplikacji
let loginManager;
document.addEventListener('DOMContentLoaded', () => {
    loginManager = new LoginManager();
});

// Dodatkowe funkcje pomocnicze
function clearAllData() {
    if (confirm('Czy na pewno chcesz usunac wszystkie dane? Ta operacja jest nieodwracalna!')) {
        localStorage.removeItem('attendanceList');
        location.reload();
    }
}

console.log('Funkcje pomocnicze:');
console.log('- clearAllData() - usuwa wszystkie dane z aplikacji');
