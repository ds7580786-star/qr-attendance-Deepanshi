import { getCurrentUser, logout } from '/utils/storage.js';

let currentConfig = null;

// ==================== Initialize Dashboard ====================

// Start dashboard after all functions are loaded
window.addEventListener('DOMContentLoaded', () => {
  initializeDashboard();
});

async function initializeDashboard() {

  // ==================== BASIC SETUP ====================

  const currentUser = getCurrentUser();

  const userName = document.querySelector('.user-name b');

  if (userName) {
    userName.textContent =
      currentUser?.name || 'Admin';
  }

  const logoutBtn =
    document.querySelector('.logout-btn');

  if (logoutBtn) {
    logoutBtn.addEventListener(
      'click',
      () => logout()
    );
  }


  // ==================== STATISTICS ====================

  try {

    const response =
      await fetch('/api/admin/stats');

    if (response.ok) {

      const data =
        await response.json();

      if (data.ok) {

        const studentCount =
          document.getElementById('studentCount');

        const facultyCount =
          document.getElementById('facultyCount');

        const liveSessionCount =
          document.getElementById('liveSessionCount');

        const attendanceCount =
          document.getElementById('attendanceCount');


        if (studentCount) {
          studentCount.textContent =
            data.stats.students ?? 0;
        }

        if (facultyCount) {
          facultyCount.textContent =
            data.stats.faculty ?? 0;
        }

        if (liveSessionCount) {
          liveSessionCount.textContent =
            data.stats.liveSessions ?? 0;
        }

        if (attendanceCount) {
          attendanceCount.textContent =
            data.stats.attendance ?? 0;
        }

      }

    }

  } catch (error) {

    console.error(
      'Could not load dashboard statistics:',
      error
    );

  }


  // ==================== STUDENTS ====================

  setupSectionManager({

    navSelector: '.student-nav',

    linkCardSelector: '.student-link-card',

    sectionSelector: '.students',

    modalId: 'studentModal',

    tableId: 'studentsTable',

    addBtnId: 'addStudentBtn',

    saveBtnId: 'saveStudentBtn',

    closeBtnId: 'closeStudentModalBtn',

    apiEndpoint: '/api/students',

    entityName: 'Student',

    needsFaceRecognition: true,

    fields: [

      {
        id: 'studentName',
        fieldName: 'name'
      },

      {
        id: 'studentUsername',
        fieldName: 'username'
      },

      {
        id: 'studentPassword',
        fieldName: 'password'
      },

      {
        id: 'studentSection',
        fieldName: 'section'
      }

    ],

    usernameField: 'username'

  });

  // ==================== FACULTY ====================

  setupFacultyManager();

  // ==================== SUBJECTS ====================

  setupSubjectManager();

  // ==================== COURSES ====================

  setupCourseManager();

  // ==================== BRANCHES ====================

  setupBranchManager();

}


// ============================================================
// Generic Section Manager
// ============================================================

// ============================================================
// GENERIC SECTION MANAGER
// ============================================================

function setupSectionManager(config) {

  const nav =
    document.querySelector(config.navSelector);

  const linkCard =
    document.querySelector(config.linkCardSelector);

  const modal =
    document.getElementById(config.modalId);

  const addBtn =
    document.getElementById(config.addBtnId);

  const saveBtn =
    document.getElementById(config.saveBtnId);


  if (!nav || !modal || !addBtn || !saveBtn) {
    console.warn(
      'Section setup skipped:',
      config.entityName
    );

    return;
  }


  const closeBtn =
    modal.querySelector(
      `[id="${config.closeBtnId}"]`
    );


  // Sidebar button

  nav.addEventListener(
    'click',
    () => {
      showSection(config);
    }
  );


  // Dashboard card

  if (linkCard) {

    linkCard.addEventListener(
      'click',
      () => {
        showSection(config);
      }
    );

  }


  // Add button

  addBtn.onclick = () => {

    editingId = null;

    clearFormFields(config);

    modal.showModal();

  };


  // Close button

  if (closeBtn) {

    closeBtn.onclick = () => {
      modal.close();
    };

  }


  // Save button

  saveBtn.onclick = async () => {

    try {

      await saveEntity(config);

    } catch (error) {

      console.error(
        `Error saving ${config.entityName}:`,
        error
      );

      alert(
        error.message ||
        `Error saving ${config.entityName}`
      );

    }

  };

}

function showSection(config) {
  document.querySelector('.homepage').style.display = 'none';
  document.querySelector('.students').style.display = 'none';
  document.querySelector('.faculty').style.display = 'none';
  document.querySelector('.attendance').style.display = 'none';

  const subjects = document.querySelector('.subjects');

  if (subjects) {
    subjects.style.display = 'none';
  }

  const courses =
    document.querySelector('.courses');

  if (courses) {
    courses.style.display = 'none';
  }

  const branches =
  document.querySelector('.branches');

if (branches) {
  branches.style.display = 'none';
}

  currentConfig = config;

  document.querySelector(config.sectionSelector).style.display =
    'block';

  loadEntities(config);
}

// ============================================================
// FACULTY MANAGER
// ============================================================

let editingFacultyUsername = null;


function setupFacultyManager() {

  const nav =
    document.querySelector('.faculty-nav');

  const linkCard =
    document.querySelector('.faculty-link-card');

  const modal =
    document.getElementById('facultyModal');

  const addBtn =
    document.getElementById('addFacultyBtn');

  const saveBtn =
    document.getElementById('saveFacultyBtn');

  const closeBtn =
    document.getElementById('closeFacultyModalBtn');


  if (
    !modal ||
    !addBtn ||
    !saveBtn ||
    !closeBtn
  ) {
    console.error('Faculty elements not found');
    return;
  }


  // Sidebar
  if (nav) {
    nav.addEventListener(
      'click',
      showFacultySection
    );
  }


  // Faculty card
  if (linkCard) {
    linkCard.addEventListener(
      'click',
      showFacultySection
    );
  }


  // Add Faculty
  addBtn.onclick = async () => {

    editingFacultyUsername = null;

    await loadFacultySubjects();

    clearFacultyForm();

    document.querySelector(
      '#facultyModal h3'
    ).textContent = 'Add Faculty';

    modal.showModal();
  };


  // Save Faculty
  saveBtn.onclick = async () => {
    await saveFaculty();
  };


  // Close
  closeBtn.onclick = () => {
    modal.close();
  };
}


// ============================================================
// SHOW FACULTY SECTION
// ============================================================

function showFacultySection() {

  document.querySelector('.homepage').style.display = 'none';
  document.querySelector('.students').style.display = 'none';
  document.querySelector('.attendance').style.display = 'none';

  const subjects =
    document.querySelector('.subjects');

  if (subjects) {
    subjects.style.display = 'none';
  }

  const courses =
    document.querySelector('.courses');

  if (courses) {
    courses.style.display = 'none';
  }

  const branches =
    document.querySelector('.branches');

  if (branches) {
    branches.style.display = 'none';
  }

  const faculty =
    document.querySelector('.faculty');

  if (faculty) {
    faculty.style.display = 'block';
  }

  loadFaculty();
}


// ============================================================
// LOAD SUBJECTS INTO FACULTY DROPDOWN
// ============================================================

async function loadFacultySubjects() {

  const subjectSelect =
    document.getElementById('facultySubject');

  if (!subjectSelect) {
    return;
  }

  try {

    const response =
      await fetch('/api/admin/subjects');

    const data =
      await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || 'Failed to load subjects'
      );
    }

    subjectSelect.innerHTML =
      '<option value="">Select Subject</option>';

    data.subjects.forEach(subject => {

      const option =
        document.createElement('option');

      option.value =
        subject.id;

      option.textContent =
        `${subject.subject_code} - ${subject.name}`;

      subjectSelect.appendChild(option);

    });

  } catch (error) {

    console.error(
      'Error loading faculty subjects:',
      error
    );

    alert(
      'Could not load subjects.'
    );
  }
}


// ============================================================
// LOAD FACULTY
// ============================================================

async function loadFaculty() {

  try {

    const response =
      await fetch('/api/admin/faculty');

    const data =
      await response.json();

    if (!response.ok || !data.ok) {

      alert(
        data.error ||
        'Failed to load faculty'
      );

      return;
    }

    const tableContainer =
      document.getElementById('facultyTable');

    tableContainer.innerHTML = '';

    new gridjs.Grid({

      columns: [
        'Name',
        'Username',
        'Subject',
        'Actions'
      ],

      data:
        data.faculty.map(faculty => [

          faculty.name,

          faculty.username,

          faculty.subject_code
            ? `${faculty.subject_code} - ${faculty.subject_name}`
            : '',

          gridjs.html(`

            <button
              onclick="window.editFaculty('${encodeURIComponent(
                JSON.stringify(faculty)
              )}')">
              Edit
            </button>

            <button
              class="button-secondary"
              onclick="window.deleteFaculty('${faculty.username}')">
              Delete
            </button>

          `)

        ]),

      search: true,

      pagination: {
        limit: 15
      },

      sort: true,

      style: {

        td: {
          border: '1px solid #ccc'
        },

        table: {
          'font-size': '18px'
        }

      },

      width: '90%',

      height: '500px',

      fixedHeader: true

    }).render(tableContainer);


  } catch (error) {

    console.error(
      'Error loading faculty:',
      error
    );

    alert(
      'Failed to load faculty.'
    );
  }
}


// ============================================================
// SAVE FACULTY
// ============================================================

async function saveFaculty() {

  const name =
    document
      .getElementById('facultyName')
      .value
      .trim();

  const username =
    document
      .getElementById('facultyUsername')
      .value
      .trim();

  const password =
    document
      .getElementById('facultyPassword')
      .value;

  const subjectId =
    document
      .getElementById('facultySubject')
      .value;


  // Validation

  if (!name) {
    alert('Faculty name is required.');
    return;
  }

  if (!username) {
    alert('Username is required.');
    return;
  }

  if (!editingFacultyUsername && !password) {
    alert('Password is required.');
    return;
  }

  if (!subjectId) {
    alert('Please select a subject.');
    return;
  }


  const facultyData = {

    name: name,

    username: username,

    subject_id: Number(subjectId)

  };


  // Only send password when provided
  if (password) {
    facultyData.password = password;
  }


  let url =
    '/api/admin/faculty';

  let method =
    'POST';


  if (editingFacultyUsername) {

    url =
      `/api/admin/faculty/${encodeURIComponent(
        editingFacultyUsername
      )}`;

    method =
      'PUT';
  }


  try {

    const response =
      await fetch(url, {

        method,

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(facultyData)

      });


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error saving faculty'
      );

      return;
    }


    alert(
      data.message ||
      'Faculty saved successfully'
    );


    editingFacultyUsername = null;

    document
      .getElementById('facultyModal')
      .close();

    clearFacultyForm();

    loadFaculty();


  } catch (error) {

    console.error(
      'Error saving faculty:',
      error
    );

    alert(
      'Something went wrong while saving faculty.'
    );
  }
}


// ============================================================
// EDIT FACULTY
// ============================================================

async function editFaculty(encodedFaculty) {

  try {

    const faculty =
      JSON.parse(
        decodeURIComponent(encodedFaculty)
      );


    editingFacultyUsername =
      faculty.username;


    await loadFacultySubjects();


    document.getElementById(
      'facultyName'
    ).value =
      faculty.name || '';


    document.getElementById(
      'facultyUsername'
    ).value =
      faculty.username || '';


    document.getElementById(
      'facultyPassword'
    ).value = '';


    document.getElementById(
      'facultySubject'
    ).value =
      faculty.subject_id || '';


    document.querySelector(
      '#facultyModal h3'
    ).textContent =
      'Edit Faculty';


    document
      .getElementById('facultyModal')
      .showModal();


  } catch (error) {

    console.error(
      'Error editing faculty:',
      error
    );

    alert(
      'Unable to edit this faculty.'
    );
  }
}


// ============================================================
// DELETE FACULTY
// ============================================================

async function deleteFaculty(username) {

  if (
    !confirm(
      'Delete this Faculty?'
    )
  ) {
    return;
  }


  try {

    const response =
      await fetch(
        `/api/admin/faculty/${encodeURIComponent(username)}`,
        {
          method: 'DELETE'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error deleting faculty'
      );

      return;
    }


    alert(
      data.message ||
      'Faculty deleted successfully'
    );


    loadFaculty();


  } catch (error) {

    console.error(
      'Error deleting faculty:',
      error
    );

    alert(
      'Something went wrong while deleting faculty.'
    );
  }
}


// ============================================================
// CLEAR FACULTY FORM
// ============================================================

function clearFacultyForm() {

  document.getElementById(
    'facultyName'
  ).value = '';

  document.getElementById(
    'facultyUsername'
  ).value = '';

  document.getElementById(
    'facultyPassword'
  ).value = '';

  document.getElementById(
    'facultySubject'
  ).value = '';
}


// ============================================================
// Generic Entity Operations
// ============================================================

async function loadEntities(config) {
  const response = await fetch(config.apiEndpoint);
  const result = await response.json();

  let entities = [];

  if (Array.isArray(result)) {
    entities = result;
  } else if (result.students) {
    entities = result.students;
  } else if (result.faculty) {
    entities = result.faculty;
  }

  const tableContainer =
    document.getElementById(config.tableId);

  tableContainer.innerHTML = '';

  new gridjs.Grid({
    columns: [
      'Name',
      'Username',
      'Section',
      'Actions',
    ],

    data: entities.map(entity => [
      entity.name,

      entity[config.usernameField],

      entity.section || '',

      gridjs.html(`
        <button
          onclick="window.editEntity('${encodeURIComponent(
            JSON.stringify(entity)
          )}')">
          Edit
        </button>

        <button
          class="button-secondary"
          onclick="window.deleteEntity(
            '${entity[config.usernameField]}',
            '${config.apiEndpoint}',
            '${config.entityName}'
          )">
          Delete
        </button>
      `),
    ]),

    style: {
      td: {
        border: '1px solid #ccc',
      },

      table: {
        'font-size': '18px',
      },
    },

    width: '70%',
    height: '500px',

    search: true,

    pagination: {
      limit: 15,
    },

    fixedHeader: true,

    sort: true,

  }).render(tableContainer);
}


async function saveEntity(config) {
  const data = {};

  config.fields.forEach(field => {
    const value =
      document.getElementById(field.id).value;

    if (!value) {
      throw new Error(
        `Missing required field: ${field.fieldName}`
      );
    }

    data[field.fieldName] = value;
  });


  // ==================== Face Recognition ====================

  if (config.needsFaceRecognition) {
    await loadModels();

    const files =
      document.getElementById('faceImages').files;

    if (files.length === 0 && !editingId) {
      alert('Upload at least one face image');
      return;
    }

    document.getElementById('faceStatus').textContent =
      'Processing faces...';

    const descriptors =
      await getDescriptorsFromImages(files);

    if (descriptors.length === 0 && !editingId) {
      alert('No valid faces detected');
      return;
    }

    if (
      descriptors.length > 0 &&
      descriptors.length < 3
    ) {
      alert(
        'Upload at least 3 images for better accuracy'
      );
    }

    if (descriptors.length > 0) {
      const centroid =
        computeCentroid(descriptors);

      data.faceDescriptor =
        JSON.stringify(
          Array.from(centroid)
        );
    }
  }


  // ==================== Save ====================

  let method = 'POST';
  let url = config.apiEndpoint;

  if (editingId) {
    method = 'PUT';

    url =
      `${config.apiEndpoint}/${editingId}`;
  }

  const response = await fetch(url, {
    method,

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify(data),
  });

  if (response.ok) {
    setTimeout(() => {
      editingId = null;

      document
        .getElementById(config.modalId)
        .close();

      location.reload();
    }, 500);

  } else {
    const result = await response.json();

    alert(
      result.error ||
      `Error saving ${config.entityName}`
    );
  }
}


function editEntity(encodedEntity) {
  const config = currentConfig;

  const modal =
    document.getElementById(config.modalId);

  const entity =
    JSON.parse(
      decodeURIComponent(encodedEntity)
    );

  editingId =
    entity[config.usernameField];

  document.querySelector(
    `#${config.modalId} h3`
  ).textContent =
    `Edit ${config.entityName}`;


  config.fields.forEach(field => {
    document.getElementById(field.id).value =
      entity[field.fieldName] || '';
  });


  modal.showModal();
}


async function deleteEntity(
  id,
  apiEndpoint,
  entityName
) {
  if (
    !confirm(
      `Delete this ${entityName}?`
    )
  ) {
    return;
  }

  const response =
    await fetch(
      `${apiEndpoint}/${id}`,
      {
        method: 'DELETE',
      }
    );

  if (response.ok) {
    location.reload();
  } else {
    const result =
      await response.json();

    alert(
      result.error ||
      `Error deleting ${entityName}`
    );
  }
}


function clearFormFields(config) {
  config.fields.forEach(field => {
    document.getElementById(field.id).value = '';
  });

  document.querySelector(
    `#${config.modalId} h3`
  ).textContent =
    `Add ${config.entityName}`;
}


// ============================================================
// Face Recognition Functions
// ============================================================

async function getDescriptorsFromImages(files) {
  const descriptors = [];

  const saveBtn =
    document.getElementById(
      'saveStudentBtn'
    );

  saveBtn.disabled = true;

  saveBtn.textContent =
    'Processing...';

  const faceStatus =
    document.getElementById(
      'faceStatus'
    );


  for (
    let i = 0;
    i < files.length;
    i++
  ) {
    faceStatus.textContent =
      `Processing image ${i + 1} of ${files.length}...`;

    const img =
      await faceapi.bufferToImage(
        files[i]
      );

    const detection =
      await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();


    if (!detection) {
      console.warn(
        'No face detected in image'
      );

      continue;
    }


    if (
      detection.detection.score < 0.7
    ) {
      console.warn(
        'Low confidence face skipped'
      );

      continue;
    }


    descriptors.push(
      detection.descriptor
    );

    console.log(
      'Face added:',
      detection.detection.score
    );
  }


  faceStatus.textContent =
    'Faces processed successfully ✅';

  saveBtn.disabled = false;

  saveBtn.textContent =
    'Save';

  return descriptors;
}


function computeCentroid(descriptors) {
  if (
    !descriptors ||
    descriptors.length === 0
  ) {
    throw new Error(
      'No face descriptors provided'
    );
  }

  const length =
    descriptors[0].length;

  const centroid =
    new Float32Array(length);


  for (
    let i = 0;
    i < length;
    i++
  ) {
    let sum = 0;

    for (
      const desc of descriptors
    ) {
      sum += desc[i];
    }

    centroid[i] =
      sum / descriptors.length;
  }


  return centroid;
}


async function loadModels() {
  await cacheModelsFromManifest(
    '/utils/models/models-manifest.json'
  );

  await Promise.all([
    faceapi.nets.ssdMobilenetv1
      .loadFromUri('/utils/models'),

    faceapi.nets.faceLandmark68Net
      .loadFromUri('/utils/models'),

    faceapi.nets.faceRecognitionNet
      .loadFromUri('/utils/models'),

  ]).then(() =>
    console.log('models loaded')
  );
}


// ============================================================
// SUBJECT MAPPING
// ============================================================

let editingSubjectId = null;


function setupSubjectManager() {
  const nav =
    document.querySelector('.subject-nav');

  const linkCard =
    document.querySelector('.subject-link-card');

  const modal =
    document.getElementById('subjectModal');

  const addBtn =
    document.getElementById('addSubjectBtn');

  const saveBtn =
    document.getElementById('saveSubjectBtn');

  const closeBtn =
    document.getElementById('closeSubjectModalBtn');


  if (
    !modal ||
    !addBtn ||
    !saveBtn ||
    !closeBtn
  ) {
    return;
  }


  if (nav) {
    nav.addEventListener(
      'click',
      showSubjectSection
    );
  }


  if (linkCard) {
    linkCard.addEventListener(
      'click',
      showSubjectSection
    );
  }


  // ==================== ADD SUBJECT ====================

  addBtn.onclick = async () => {

    editingSubjectId = null;

    await loadSubjectDropdowns();

    clearSubjectForm();

    document.querySelector(
      '#subjectModal h3'
    ).textContent = 'Add Subject';

    modal.showModal();
  };


  // ==================== CLOSE ====================

  closeBtn.onclick = () => {
    modal.close();
  };


  // ==================== SAVE ====================

  saveBtn.onclick = async () => {
    await saveSubject();
  };
}


// ============================================================
// LOAD COURSE + BRANCH DROPDOWNS
// ============================================================

async function loadSubjectDropdowns() {

  const courseSelect =
    document.getElementById('subjectCourse');

  const branchSelect =
    document.getElementById('subjectBranch');


  if (
    !courseSelect ||
    !branchSelect
  ) {
    return;
  }


  try {

    // Load courses only
    const courseResponse =
      await fetch('/api/admin/courses');


    if (!courseResponse.ok) {
      throw new Error('Failed to load courses');
    }


    const courses =
      await courseResponse.json();


    // Clear dropdowns
    courseSelect.innerHTML =
      '<option value="">Select Course</option>';

    branchSelect.innerHTML =
      '<option value="">Select Branch</option>';


    // Add courses
    courses.forEach(course => {

      const option =
        document.createElement('option');

      option.value =
        course.id;

      option.textContent =
        course.name;

      courseSelect.appendChild(option);

    });


    // When Course changes,
    // load only its branches
    courseSelect.onchange = async () => {

      const courseId =
        courseSelect.value;


      branchSelect.innerHTML =
        '<option value="">Select Branch</option>';


      if (!courseId) {
        return;
      }


      try {

        const branchResponse =
          await fetch(
            `/api/admin/branches?course_id=${encodeURIComponent(courseId)}`
          );


        if (!branchResponse.ok) {
          throw new Error('Failed to load branches');
        }


        const branches =
          await branchResponse.json();


        branches.forEach(branch => {

          const option =
            document.createElement('option');

          option.value =
            branch.id;

          option.textContent =
            branch.name;

          branchSelect.appendChild(option);

        });

      } catch (error) {

        console.error(
          'Error loading branches:',
          error
        );

        alert(
          'Could not load branches.'
        );

      }

    };


  } catch (error) {

    console.error(
      'Error loading courses:',
      error
    );

    alert(
      'Could not load courses.'
    );

  }

}


// ============================================================
// SHOW SUBJECT SECTION
// ============================================================

function showSubjectSection() {

  document.querySelector(
    '.homepage'
  ).style.display = 'none';


  document.querySelector(
    '.students'
  ).style.display = 'none';


  document.querySelector(
    '.faculty'
  ).style.display = 'none';


  document.querySelector(
    '.attendance'
  ).style.display = 'none';

  const courses =
  document.querySelector('.courses');

  if (courses) {
    courses.style.display = 'none';
  } 

  const subjects =
    document.querySelector('.subjects');


  if (subjects) {

    subjects.style.display = 'block';

    loadSubjectDropdowns();

    loadSubjects();
  }
}


// ============================================================
// LOAD SUBJECTS
// ============================================================

async function loadSubjects() {

  try {

    const response =
      await fetch('/api/admin/subjects');

    const data =
      await response.json();


    if (!data.ok) {

      alert(
        data.error ||
        'Failed to load subjects'
      );

      return;
    }


    const tableContainer =
      document.getElementById(
        'subjectsTable'
      );


    tableContainer.innerHTML = '';


    new gridjs.Grid({

      columns: [
        'Subject Code',
        'Abbreviation',
        'Subject Name',
        'Branch',
        'Course',
        'Semester',
        'Actions'
      ],


      data:
        data.subjects.map(subject => [

          subject.subject_code,

          subject.abbr || '',

          subject.name,

          subject.branch_name || '',

          subject.course_name || '',

          subject.semester || '',


          gridjs.html(`

            <button
              onclick="window.editSubject('${encodeURIComponent(
                JSON.stringify(subject)
              )}')">
              Edit
            </button>


            <button
              class="button-secondary"
              onclick="window.deleteSubject('${subject.id}')">
              Delete
            </button>

          `)

        ]),


      search: true,


      pagination: {
        limit: 15
      },


      sort: true,


      style: {

        td: {
          border: '1px solid #ccc'
        },

        table: {
          'font-size': '18px'
        }

      },


      width: '95%',

      height: '500px',

      fixedHeader: true

    }).render(tableContainer);


  } catch (error) {

    console.error(
      'Error loading subjects:',
      error
    );

    alert(
      'Failed to load subjects.'
    );
  }
}


// ============================================================
// SAVE SUBJECT
// ============================================================

async function saveSubject() {

  const subjectCode =
    document
      .getElementById('subjectCode')
      .value
      .trim();


  const abbr =
    document
      .getElementById('subjectAbbr')
      .value
      .trim();


  const name =
    document
      .getElementById('subjectName')
      .value
      .trim();


  const branchId =
    document.getElementById(
      'subjectBranch'
    ).value;


  const courseId =
    document.getElementById(
      'subjectCourse'
    ).value;


  const semester =
    document.getElementById(
      'subjectSemester'
    ).value;


  // ==================== VALIDATION ====================

  if (!subjectCode) {

    alert('Subject code is required.');

    return;
  }


  if (!name) {

    alert('Subject name is required.');

    return;
  }


  if (!courseId) {

    alert('Please select a course.');

    return;
  }


  if (!branchId) {

    alert('Please select a branch.');

    return;
  }


  if (!semester) {

    alert('Please select a semester.');

    return;
  }


  // ==================== DATA ====================

  const subjectData = {

    subject_code: subjectCode,

    abbr: abbr || null,

    name: name,

    course_id: Number(courseId),

    branch_id: Number(branchId),

    semester: Number(semester)

  };


  let url =
    '/api/admin/subjects';


  let method =
    'POST';


  // ==================== EDIT ====================

  if (editingSubjectId) {

    url =
      `/api/admin/subjects/${editingSubjectId}`;

    method =
      'PUT';
  }


  // ==================== REQUEST ====================

  try {

    const response =
      await fetch(url, {

        method,

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(subjectData)

      });


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error saving subject'
      );

      return;
    }


    alert(
      data.message ||
      'Subject saved successfully'
    );


    editingSubjectId = null;


    document
      .getElementById('subjectModal')
      .close();


    clearSubjectForm();


    loadSubjects();


  } catch (error) {

    console.error(
      'Error saving subject:',
      error
    );

    alert(
      'Something went wrong while saving the subject.'
    );
  }
}


// ============================================================
// EDIT SUBJECT
// ============================================================

async function editSubject(encodedSubject) {

  const subject =
    JSON.parse(
      decodeURIComponent(encodedSubject)
    );


  // Use database ID
  editingSubjectId =
    subject.id;


  // Load dropdowns first
  await loadSubjectDropdowns();


  // ==================== FILL FORM ====================

  document.getElementById(
    'subjectCode'
  ).value =
    subject.subject_code || '';


  document.getElementById(
    'subjectAbbr'
  ).value =
    subject.abbr || '';


  document.getElementById(
    'subjectName'
  ).value =
    subject.name || '';


  document.getElementById(
    'subjectBranch'
  ).value =
    subject.branch_id || '';


  document.getElementById(
    'subjectCourse'
  ).value =
    subject.course_id || '';


  document.getElementById(
    'subjectSemester'
  ).value =
    subject.semester || '';


  document.querySelector(
    '#subjectModal h3'
  ).textContent =
    'Edit Subject';


  document
    .getElementById('subjectModal')
    .showModal();
}


// ============================================================
// DELETE SUBJECT
// ============================================================

async function deleteSubject(subjectId) {

  if (
    !confirm(
      'Delete this subject?'
    )
  ) {
    return;
  }


  try {

    const response =
      await fetch(
        `/api/admin/subjects/${subjectId}`,
        {
          method: 'DELETE'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error deleting subject'
      );

      return;
    }


    alert(
      data.message ||
      'Subject deleted successfully'
    );


    loadSubjects();


  } catch (error) {

    console.error(
      'Error deleting subject:',
      error
    );

    alert(
      'Something went wrong while deleting the subject.'
    );
  }
}


// ============================================================
// CLEAR SUBJECT FORM
// ============================================================

function clearSubjectForm() {

  document.getElementById(
    'subjectCode'
  ).value = '';


  document.getElementById(
    'subjectAbbr'
  ).value = '';


  document.getElementById(
    'subjectName'
  ).value = '';


  document.getElementById(
    'subjectBranch'
  ).value = '';


  document.getElementById(
    'subjectCourse'
  ).value = '';


  document.getElementById(
    'subjectSemester'
  ).value = '';
}

// ============================================================
// COURSE MAPPING
// ============================================================

let editingCourseId = null;


// ============================================================
// SETUP COURSE MANAGER
// ============================================================

function setupCourseManager() {

  const nav =
    document.querySelector('.course-nav');

  const modal =
    document.getElementById('courseModal');

  const addBtn =
    document.getElementById('addCourseBtn');

  const saveBtn =
    document.getElementById('saveCourseBtn');

  const closeBtn =
    document.getElementById('closeCourseModalBtn');


  if (
    !nav ||
    !modal ||
    !addBtn ||
    !saveBtn ||
    !closeBtn
  ) {

    console.error(
      'Course Master elements not found'
    );

    return;
  }


  // ==================== NAVIGATION ====================

  nav.addEventListener(
    'click',
    showCourseSection
  );


  // ==================== ADD COURSE ====================

  addBtn.onclick = () => {

    editingCourseId = null;

    clearCourseForm();

    document.querySelector(
      '#courseModal h3'
    ).textContent =
      'Add Course';

    modal.showModal();
  };


  // ==================== CLOSE MODAL ====================

  closeBtn.onclick = () => {
    modal.close();
  };


  // ==================== SAVE COURSE ====================

  saveBtn.onclick = async () => {
    await saveCourse();
  };
}


// ============================================================
// SHOW COURSE SECTION
// ============================================================

function showCourseSection() {

  // Hide other sections

  document.querySelector(
    '.homepage'
  ).style.display = 'none';


  document.querySelector(
    '.students'
  ).style.display = 'none';


  document.querySelector(
    '.faculty'
  ).style.display = 'none';


  document.querySelector(
    '.attendance'
  ).style.display = 'none';


  const subjects =
    document.querySelector('.subjects');

  if (subjects) {
    subjects.style.display = 'none';
  }


  // Show courses

  const courses =
    document.querySelector('.courses');

  if (courses) {

    courses.style.display = 'block';

    loadCourses();
  }
}


// ============================================================
// LOAD COURSES
// ============================================================

async function loadCourses() {

  try {

    const response =
      await fetch('/api/admin/courses');


    const courses =
      await response.json();


    if (!response.ok) {

      alert(
        courses.error ||
        'Failed to load courses'
      );

      return;
    }


    const tableContainer =
      document.getElementById(
        'coursesTable'
      );


    tableContainer.innerHTML = '';


    new gridjs.Grid({

      columns: [
        'Course Name',
        'Abbreviation',
        'Actions'
      ],


      data:
        courses.map(course => [

          course.name,

          course.abbr || '',


          gridjs.html(`

            <button
              onclick="window.editCourse('${encodeURIComponent(
                JSON.stringify(course)
              )}')">
              Edit
            </button>


            <button
              class="button-secondary"
              onclick="window.deleteCourse('${course.id}')">
              Delete
            </button>

          `)

        ]),


      search: true,


      pagination: {
        limit: 15
      },


      sort: true,


      style: {

        td: {
          border: '1px solid #ccc'
        },

        table: {
          'font-size': '18px'
        }

      },


      width: '90%',


      height: '500px',


      fixedHeader: true

    }).render(tableContainer);


  } catch (error) {

    console.error(
      'Error loading courses:',
      error
    );

    alert(
      'Failed to load courses.'
    );
  }
}


// ============================================================
// SAVE COURSE
// ============================================================

async function saveCourse() {

  const name =
    document
      .getElementById('courseName')
      .value
      .trim();


  const abbr =
    document
      .getElementById('courseAbbr')
      .value
      .trim();


  // ==================== VALIDATION ====================

  if (!name) {

    alert(
      'Course name is required.'
    );

    return;
  }


  // ==================== DATA ====================

  const courseData = {

    name: name,

    abbr: abbr || null

  };


  // ==================== URL + METHOD ====================

  let url =
    '/api/admin/courses';

  let method =
    'POST';


  // Editing existing course

  if (editingCourseId) {

    url =
      `/api/admin/courses/${editingCourseId}`;

    method =
      'PUT';
  }


  // ==================== REQUEST ====================

  try {

    const response =
      await fetch(url, {

        method,

        headers: {
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify(courseData)

      });


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error saving course'
      );

      return;
    }


    alert(
      data.message ||
      'Course saved successfully'
    );


    editingCourseId = null;


    document
      .getElementById('courseModal')
      .close();


    clearCourseForm();


    loadCourses();


  } catch (error) {

    console.error(
      'Error saving course:',
      error
    );

    alert(
      'Something went wrong while saving the course.'
    );
  }
}


// ============================================================
// EDIT COURSE
// ============================================================

function editCourse(encodedCourse) {

  const course =
    JSON.parse(
      decodeURIComponent(encodedCourse)
    );


  editingCourseId =
    course.id;


  document
    .getElementById('courseName')
    .value =
      course.name || '';


  document
    .getElementById('courseAbbr')
    .value =
      course.abbr || '';


  document.querySelector(
    '#courseModal h3'
  ).textContent =
    'Edit Course';


  document
    .getElementById('courseModal')
    .showModal();
}


// ============================================================
// DELETE COURSE
// ============================================================

async function deleteCourse(courseId) {

  if (
    !confirm(
      'Delete this course?'
    )
  ) {
    return;
  }


  try {

    const response =
      await fetch(
        `/api/admin/courses/${courseId}`,
        {
          method: 'DELETE'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error deleting course'
      );

      return;
    }


    alert(
      data.message ||
      'Course deleted successfully'
    );


    loadCourses();


  } catch (error) {

    console.error(
      'Error deleting course:',
      error
    );

    alert(
      'Something went wrong while deleting the course.'
    );
  }
}


// ============================================================
// CLEAR COURSE FORM
// ============================================================

function clearCourseForm() {

  document
    .getElementById('courseName')
    .value = '';


  document
    .getElementById('courseAbbr')
    .value = '';
}

// ============================================================
// BRANCH MAPPING
// ============================================================


let editingBranchId = null;


// ============================================================
// SETUP BRANCH MANAGER
// ============================================================

function setupBranchManager() {

  const nav =
    document.querySelector('.branch-nav');

  const modal =
    document.getElementById('branchModal');

  const addBtn =
    document.getElementById('addBranchBtn');

  const saveBtn =
    document.getElementById('saveBranchBtn');

  const closeBtn =
    document.getElementById('closeBranchModalBtn');


  if (
    !modal ||
    !addBtn ||
    !saveBtn ||
    !closeBtn
  ) {
    console.error('Branch Master elements not found');
    return;
  }


  // Sidebar
  if (nav) {
    nav.addEventListener(
      'click',
      showBranchSection
    );
  }


  // Add Branch
  addBtn.onclick = async () => {

    editingBranchId = null;

    await loadBranchCourses();

    clearBranchForm();

    document.querySelector(
      '#branchModal h3'
    ).textContent = 'Add Branch';

    modal.showModal();
  };


  // Save
  saveBtn.onclick = async () => {
    await saveBranch();
  };


  // Close
  closeBtn.onclick = () => {
    modal.close();
  };
}


// ============================================================
// SHOW BRANCH SECTION
// ============================================================

function showBranchSection() {

  document
    .querySelector('.homepage')
    ?.style.setProperty('display', 'none');

  document
    .querySelector('.students')
    ?.style.setProperty('display', 'none');

  document
    .querySelector('.faculty')
    ?.style.setProperty('display', 'none');

  document
    .querySelector('.attendance')
    ?.style.setProperty('display', 'none');

  document
    .querySelector('.subjects')
    ?.style.setProperty('display', 'none');

  document
    .querySelector('.courses')
    ?.style.setProperty('display', 'none');


  const branches =
    document.querySelector('.branches');

  if (branches) {

    branches.style.display = 'block';

    loadBranches();
  }
}


// ============================================================
// LOAD COURSES INTO BRANCH DROPDOWN
// ============================================================

async function loadBranchCourses() {

  const courseSelect =
    document.getElementById('branchCourse');

  if (!courseSelect) {
    return;
  }


  try {

    const response =
      await fetch('/api/admin/courses');


    if (!response.ok) {
      throw new Error('Failed to load courses');
    }


    const courses =
      await response.json();


    courseSelect.innerHTML =
      '<option value="">Select Course</option>';


    courses.forEach(course => {

      const option =
        document.createElement('option');

      option.value =
        course.id;

      option.textContent =
        course.name;

      courseSelect.appendChild(option);

    });

  } catch (error) {

    console.error(
      'Error loading branch courses:',
      error
    );

    alert(
      'Failed to load courses.'
    );
  }
}


// ============================================================
// LOAD BRANCHES
// ============================================================

async function loadBranches() {

  try {

    const response =
      await fetch('/api/admin/branches');


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        'Failed to load branches'
      );
    }


    const tableContainer =
      document.getElementById(
        'branchesTable'
      );


    tableContainer.innerHTML = '';


    new gridjs.Grid({

      columns: [
        'Course',
        'Branch Name',
        'Abbreviation',
        'Actions'
      ],


      data:
        data.map(branch => [

          branch.course_name || '',

          branch.name || '',

          branch.abbr || '',


          gridjs.html(`

            <button
              onclick="window.editBranch('${encodeURIComponent(
                JSON.stringify(branch)
              )}')"
            >
              Edit
            </button>


            <button
              class="button-secondary"
              onclick="window.deleteBranch('${branch.id}')"
            >
              Delete
            </button>

          `)

        ]),


      search: true,


      pagination: {
        limit: 15
      },


      sort: true,


      style: {

        td: {
          border: '1px solid #ccc'
        },

        table: {
          'font-size': '18px'
        }

      },


      width: '95%',


      height: '500px',


      fixedHeader: true

    }).render(tableContainer);


  } catch (error) {

    console.error(
      'Error loading branches:',
      error
    );

    alert(
      'Failed to load branches.'
    );
  }
}


// ============================================================
// SAVE BRANCH
// ============================================================

async function saveBranch() {

  const courseId =
    document.getElementById(
      'branchCourse'
    ).value;


  const name =
    document.getElementById(
      'branchName'
    ).value.trim();


  const abbr =
    document.getElementById(
      'branchAbbr'
    ).value.trim();


  // Validation

  if (!courseId) {

    alert(
      'Please select a course.'
    );

    return;
  }


  if (!name) {

    alert(
      'Branch name is required.'
    );

    return;
  }


  const branchData = {

    course_id:
      Number(courseId),

    name:
      name,

    abbr:
      abbr || null

  };


  let url =
    '/api/admin/branches';


  let method =
    'POST';


  // Edit existing branch

  if (editingBranchId) {

    url =
      `/api/admin/branches/${editingBranchId}`;

    method =
      'PUT';
  }


  try {

    const response =
      await fetch(
        url,
        {
          method,

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(
              branchData
            )
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error saving branch'
      );

      return;
    }


    alert(
      data.message ||
      'Branch saved successfully'
    );


    editingBranchId = null;


    document
      .getElementById(
        'branchModal'
      )
      .close();


    clearBranchForm();


    loadBranches();


  } catch (error) {

    console.error(
      'Error saving branch:',
      error
    );

    alert(
      'Something went wrong while saving the branch.'
    );
  }
}


// ============================================================
// EDIT BRANCH
// ============================================================

function editBranch(encodedBranch) {

  try {

    const branch =
      JSON.parse(
        decodeURIComponent(
          encodedBranch
        )
      );


    editingBranchId =
      branch.id;


    // Load courses first
    loadBranchCourses()
      .then(() => {

        document.getElementById(
          'branchCourse'
        ).value =
          branch.course_id || '';


        document.getElementById(
          'branchName'
        ).value =
          branch.name || '';


        document.getElementById(
          'branchAbbr'
        ).value =
          branch.abbr || '';


        document.querySelector(
          '#branchModal h3'
        ).textContent =
          'Edit Branch';


        document
          .getElementById(
            'branchModal'
          )
          .showModal();

      });


  } catch (error) {

    console.error(
      'Error editing branch:',
      error
    );

    alert(
      'Unable to edit this branch.'
    );
  }
}


// ============================================================
// DELETE BRANCH
// ============================================================

async function deleteBranch(branchId) {

  if (
    !confirm(
      'Delete this branch?'
    )
  ) {
    return;
  }


  try {

    const response =
      await fetch(
        `/api/admin/branches/${branchId}`,
        {
          method: 'DELETE'
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      alert(
        data.error ||
        'Error deleting branch'
      );

      return;
    }


    alert(
      data.message ||
      'Branch deleted successfully'
    );


    loadBranches();


  } catch (error) {

    console.error(
      'Error deleting branch:',
      error
    );

    alert(
      'Something went wrong while deleting the branch.'
    );
  }
}


// ============================================================
// CLEAR BRANCH FORM
// ============================================================

function clearBranchForm() {

  document.getElementById(
    'branchCourse'
  ).value = '';


  document.getElementById(
    'branchName'
  ).value = '';


  document.getElementById(
    'branchAbbr'
  ).value = '';
}

// ============================================================
// Global Functions for HTML onclick
// ============================================================

window.editEntity =
  editEntity;

window.deleteEntity =
  deleteEntity;

window.editSubject =
  editSubject;

window.deleteSubject =
  deleteSubject;

window.editCourse =
  editCourse;

window.deleteCourse =
  deleteCourse;

window.editBranch =
  editBranch;

window.deleteBranch =
  deleteBranch;

window.editFaculty =
  editFaculty;

window.deleteFaculty =
  deleteFaculty;